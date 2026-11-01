        // =====================================================================
        //  DREAM PLANETS — 3D worlds for the dreamlike star maps (prototype)
        // =====================================================================
        //  Groundwork for interdimensional travel. A planet is a real sphere,
        //  shaded per pixel on the game's own Canvas 2D: its surface (marbled,
        //  domain-warped noise through a pastel palette) is baked once into an
        //  equirectangular texture, and each pixel of the disc keeps where it
        //  looks on that texture and how the light falls on it, so a frame only
        //  slides the texture round (the planet turns) and blends. Clouds turn a
        //  little faster than the ground. On top: a wrap-round soft light with a
        //  rose terminator, rivers of light on the night side, a glass rim,
        //  an atmosphere halo, a tilted ring with glints, and small moons.
        //  `DreamStarMap.open()` (Settings → Developer → Dream Star Map) shows
        //  them over a nebula sky with a constellation drawn as a star chart.

        /* ----- 3D value noise ----- */
        function _dpHash(x, y, z, s) {
            let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(s, 1442695041);
            h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
            return (h >>> 0) / 4294967296;
        }
        function _dpNoise(x, y, z, s) {
            const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
            let fx = x - xi, fy = y - yi, fz = z - zi;
            fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
            const c = (i, j, k) => _dpHash(xi + i, yi + j, zi + k, s);
            const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * fx, x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * fx;
            const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * fx, x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * fx;
            const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
            return y0 + (y1 - y0) * fz;
        }
        function _dpFbm(x, y, z, s, oct = 5) {
            let a = 0.5, f = 1, sum = 0, norm = 0;
            for (let i = 0; i < oct; i++) { sum += a * _dpNoise(x * f, y * f, z * f, s + i * 17); norm += a; a *= 0.5; f *= 2.03; }
            return sum / norm;
        }
        const _dpClamp = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
        const _dpSmooth = (a, b, v) => { const t = _dpClamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

        /*  Palettes: the surface runs through a cosine palette a + b·cos(2π(c·t + d)) (per channel).
            sun/shade light it, dusk tints the terminator, rim is the glass edge, lights the night side's rivers. */
        const DREAM_PALETTES = {
            reverie: {
                name: 'Lilac Reverie',
                a: [0.66, 0.56, 0.78], b: [0.30, 0.30, 0.24], c: [1.0, 1.0, 1.0], d: [0.02, 0.22, 0.50],
                sea: [0.30, 0.55, 0.85], sun: [1.10, 0.98, 1.02], shade: [0.20, 0.12, 0.40], dusk: [1.0, 0.42, 0.72],
                rim: [0.55, 0.88, 1.0], lights: [1.0, 0.80, 0.48], cloud: [1.0, 0.94, 1.0],
                halo: '159, 216, 255', halo2: '255, 143, 216', ring: [[0.62, 0.92, 1.0], [1.0, 0.70, 0.90], [1.0, 0.88, 0.62]],
                seed: 949, swirl: 2.3, bands: 5, seaLevel: 0.40, clouds: 0.55
            },
            lullaby: {
                name: 'Coral Lullaby',
                a: [0.78, 0.56, 0.54], b: [0.26, 0.28, 0.26], c: [1.0, 0.9, 0.8], d: [0.00, 0.12, 0.30],
                sea: [0.32, 0.78, 0.80], sun: [1.12, 0.98, 0.92], shade: [0.30, 0.10, 0.30], dusk: [1.0, 0.55, 0.40],
                rim: [1.0, 0.75, 0.88], lights: [0.70, 1.0, 0.92], cloud: [1.0, 0.92, 0.88],
                halo: '255, 176, 196', halo2: '255, 220, 150', ring: [[1.0, 0.80, 0.70], [1.0, 0.60, 0.72], [0.80, 1.0, 0.92]],
                seed: 89, swirl: 2.8, bands: 3, seaLevel: 0.46, clouds: 0.62
            },
            hush: {
                name: 'Aurora Hush',
                a: [0.40, 0.62, 0.70], b: [0.30, 0.30, 0.30], c: [0.9, 1.0, 1.1], d: [0.45, 0.25, 0.10],
                sea: [0.16, 0.30, 0.62], sun: [0.98, 1.04, 1.12], shade: [0.08, 0.14, 0.34], dusk: [0.55, 0.40, 1.0],
                rim: [0.55, 1.0, 0.82], lights: [1.0, 0.60, 0.95], cloud: [0.90, 1.0, 1.0],
                halo: '130, 255, 210', halo2: '170, 140, 255', ring: [[0.55, 1.0, 0.85], [0.70, 0.62, 1.0], [0.95, 0.95, 1.0]],
                seed: 2026, swirl: 1.9, bands: 7, seaLevel: 0.44, clouds: 0.48
            },
            ember: {   // a small moon
                name: 'Ember Moon',
                a: [0.80, 0.62, 0.50], b: [0.22, 0.22, 0.20], c: [1.0, 1.0, 1.0], d: [0.05, 0.15, 0.25],
                sea: [0.85, 0.50, 0.40], sun: [1.1, 1.0, 0.95], shade: [0.25, 0.10, 0.25], dusk: [1.0, 0.5, 0.5],
                rim: [1.0, 0.85, 0.70], lights: [1.0, 0.70, 0.40], cloud: [1, 1, 1],
                halo: '255, 200, 160', halo2: '255, 150, 200', ring: null, seed: 31, swirl: 1.6, bands: 2, seaLevel: 0.3, clouds: 0
            },
            pearl: {   // a small moon
                name: 'Pearl Moon',
                a: [0.80, 0.80, 0.88], b: [0.14, 0.14, 0.16], c: [1.0, 1.0, 1.0], d: [0.60, 0.65, 0.75],
                sea: [0.60, 0.70, 0.95], sun: [1.05, 1.05, 1.1], shade: [0.18, 0.16, 0.38], dusk: [0.9, 0.6, 1.0],
                rim: [0.80, 0.90, 1.0], lights: [0.7, 0.9, 1.0], cloud: [1, 1, 1],
                halo: '210, 220, 255', halo2: '230, 190, 255', ring: null, seed: 7, swirl: 1.4, bands: 1, seaLevel: 0.36, clouds: 0
            }
        };

        class DreamPlanet {
            /** opts: palette (key or object), res (the disc's pixel radius when baked), tilt (axial, rad), pitch (view from above, rad),
                spin (turns per minute), ring (bool), light ([x, y, z] towards the sun, screen space, y up) */
            constructor(opts = {}) {
                const P = typeof opts.palette === 'string' ? DREAM_PALETTES[opts.palette] : (opts.palette || DREAM_PALETTES.reverie);
                this.P = P;
                this.res = Math.max(8, Math.round(opts.res || 160));
                this.tilt = opts.tilt != null ? opts.tilt : -0.38;
                this.pitch = opts.pitch != null ? opts.pitch : 0.32;
                this.spin = opts.spin != null ? opts.spin : 0.9;
                this.ring = opts.ring != null ? opts.ring : !!P.ring;
                const L = opts.light || [-0.62, 0.42, 0.66], n = Math.hypot(L[0], L[1], L[2]);
                this.light = [L[0] / n, L[1] / n, L[2] / n];
                this.texW = opts.texW || (this.res > 60 ? 512 : 128); this.texH = this.texW >> 1;
                this.angle = 0;        // the turn (radians), driven by update(dt) or set directly
                this._bakeTexture();
                this._bakeDisc();
                if (this.ring) this._bakeRing();
            }

            /* The surface, once: colour, gloss (seas), emission (rivers of light, sparks) and cloud cover. */
            _bakeTexture() {
                const P = this.P, W = this.texW, H = this.texH, s = P.seed, N = W * H;
                this.tex = new Float32Array(N * 3); this.gloss = new Float32Array(N); this.emit = new Float32Array(N); this.cloudA = new Float32Array(N);
                const TAU = Math.PI * 2;
                for (let j = 0; j < H; j++) {
                    const lat = (0.5 - (j + 0.5) / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
                    for (let i = 0; i < W; i++) {
                        const lon = (i + 0.5) / W * TAU, x = cl * Math.sin(lon), y = sl, z = cl * Math.cos(lon);
                        // domain warp: the marbling
                        const qx = _dpFbm(x * 1.6, y * 1.6, z * 1.6, s, 4), qy = _dpFbm(x * 1.6 + 5.2, y * 1.6 + 1.3, z * 1.6, s + 3, 4), qz = _dpFbm(x * 1.6, y * 1.6 + 7.7, z * 1.6 + 2.1, s + 5, 4);
                        const sw = P.swirl;
                        const h = _dpFbm(x * 2.1 + sw * qx, y * 2.1 + sw * qy, z * 2.1 + sw * qz, s + 11, 5);
                        const bands = 0.5 + 0.5 * Math.sin(lat * P.bands + h * 7 + qx * 4);
                        const t = h * 0.85 + bands * 0.3 + qy * 0.25;
                        const k = j * W + i, o = k * 3;
                        let r = P.a[0] + P.b[0] * Math.cos(TAU * (P.c[0] * t + P.d[0]));
                        let g = P.a[1] + P.b[1] * Math.cos(TAU * (P.c[1] * t + P.d[1]));
                        let b = P.a[2] + P.b[2] * Math.cos(TAU * (P.c[2] * t + P.d[2]));
                        // seas: glassy pools below the sea level
                        const sea = 1 - _dpSmooth(P.seaLevel - 0.03, P.seaLevel + 0.02, h);
                        if (sea > 0) {
                            const deep = _dpSmooth(P.seaLevel, P.seaLevel - 0.12, h);
                            r += (P.sea[0] * (1 - deep * 0.45) - r) * sea; g += (P.sea[1] * (1 - deep * 0.45) - g) * sea; b += (P.sea[2] * (1 - deep * 0.3) - b) * sea;
                        }
                        this.tex[o] = r; this.tex[o + 1] = g; this.tex[o + 2] = b;
                        this.gloss[k] = sea;
                        // rivers of light along the coasts and one contour inland, plus scattered sparks (only seen at night)
                        const river = Math.exp(-Math.abs(h - (P.seaLevel + 0.015)) * 90) * 0.9 + Math.exp(-Math.abs(h - (P.seaLevel + 0.16)) * 120) * 0.55;
                        const spark = (1 - sea) * (_dpHash(i, j, 3, s) > 0.985 ? 0.6 + _dpHash(i, j, 4, s) * 0.8 : 0);
                        this.emit[k] = river + spark;
                        if (P.clouds > 0) {
                            const c = _dpFbm(x * 2.6 + qz * 1.8, y * 5.2 + qx * 1.2, z * 2.6 + qy * 1.8, s + 23, 5);
                            this.cloudA[k] = _dpSmooth(1 - P.clouds * 0.62, 1 - P.clouds * 0.62 + 0.22, c) * 0.85;
                        }
                    }
                }
            }

            /* The disc, once: for each pixel, where it looks on the texture and how it's lit. */
            _bakeDisc() {
                const R = this.res, S = R * 2 + 2, c = S / 2, W = this.texW, H = this.texH, L = this.light;
                const ct = Math.cos(this.tilt), st = Math.sin(this.tilt), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
                const hx = L[0], hy = L[1], hz = L[2] + 1, hn = Math.hypot(hx, hy, hz);
                const idx = [], U = [], V = [], A = [], D = [], NDL = [], SPEC = [], RIM = [], NZ = [], DUSK = [];
                for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
                    const dx = (px + 0.5 - c) / R, dy = -(py + 0.5 - c) / R, d = Math.hypot(dx, dy);
                    if (d > 1 + 1.5 / R) continue;
                    const dd = Math.min(d, 0.9999), nz = Math.sqrt(1 - dd * dd), nx = dx * (dd / (d || 1)), ny = dy * (dd / (d || 1));
                    // view → body: undo the axial tilt (in the screen's plane), then the pitch (seeing the north a little)
                    const x1 = nx * ct + ny * st, y1 = -nx * st + ny * ct, z1 = nz;
                    const by = y1 * cp + z1 * sp, bz = -y1 * sp + z1 * cp, bx = x1;
                    const lon = Math.atan2(bx, bz), lat = Math.asin(Math.max(-1, Math.min(1, by)));
                    idx.push(py * S + px);
                    U.push(((lon / (Math.PI * 2)) * W + W) % W); V.push(Math.min(H - 1.001, Math.max(0, (0.5 - lat / Math.PI) * H - 0.5)));
                    A.push(_dpClamp((1 - d) * R + 0.5));
                    const ndl = nx * L[0] + ny * L[1] + nz * L[2];
                    NDL.push(ndl);
                    D.push(Math.pow(_dpClamp((ndl + 0.28) / 1.28), 1.25));                       // wrapped, soft: dream light
                    SPEC.push(Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hn), 46));
                    RIM.push(Math.pow(1 - nz, 2.6) * (0.35 + 0.75 * _dpClamp(ndl + 0.55))); NZ.push(nz * 1.4);
                    DUSK.push(Math.exp(-((ndl - 0.02) * (ndl - 0.02)) / 0.035) * 0.55);              // the rose band along the terminator
                }
                const f = (a) => Float32Array.from(a);
                this.disc = { S, idx: Int32Array.from(idx), U: f(U), V: f(V), A: f(A), D: f(D), NDL: f(NDL), SPEC: f(SPEC), RIM: f(RIM), NZ: f(NZ), DUSK: f(DUSK) };
                this.cv = document.createElement('canvas'); this.cv.width = this.cv.height = S;
                this.cx = this.cv.getContext('2d');
                this.img = this.cx.createImageData(S, S);
            }

            /* The ring, once: a top-down annulus with dreamy bands, drawn squashed and turned in draw(). */
            _bakeRing() {
                const P = this.P, N = 512, c = N / 2, img = new ImageData(N, N), d = img.data, s = P.seed;
                this.ringIn = 1.38; this.ringOut = 2.3;
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                    const r = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c * this.ringOut;
                    if (r < this.ringIn || r > this.ringOut) continue;
                    const u = (r - this.ringIn) / (this.ringOut - this.ringIn);
                    const band = _dpFbm(u * 14, 0.5, 0.5, s + 41, 4), fine = _dpNoise(u * 90, 1.5, 0.5, s + 43);
                    let a = _dpSmooth(0.32, 0.62, band) * (0.55 + 0.45 * fine) * _dpSmooth(0, 0.06, u) * _dpSmooth(1, 0.82, u);
                    if (Math.abs(u - 0.58) < 0.025) a *= 0.12;                                     // a gap
                    const cols = P.ring, k = u * (cols.length - 1), i0 = Math.min(cols.length - 2, Math.floor(k)), t = k - i0;
                    const o = (y * N + x) * 4;
                    for (let ch = 0; ch < 3; ch++) d[o + ch] = 255 * Math.min(1, cols[i0][ch] + (cols[i0 + 1][ch] - cols[i0][ch]) * t);
                    d[o + 3] = 255 * Math.min(1, a * 0.85);
                }
                this.ringCv = document.createElement('canvas'); this.ringCv.width = this.ringCv.height = N;
                this.ringCv.getContext('2d').putImageData(img, 0, 0);
                this.ringRatio = 0.30;            // how flat it looks: sin of the view's angle onto the ring's plane
            }

            update(dt) { this.angle = (this.angle + dt * this.spin * Math.PI * 2 / 60) % (Math.PI * 2); }

            /* Shade the disc for the current turn. */
            _render(time) {
                const P = this.P, D = this.disc, W = this.texW, H = this.texH, T = this.tex, G = this.gloss, E = this.emit, CA = this.cloudA;
                const out = this.img.data, n = D.idx.length;
                const rot = this.angle / (Math.PI * 2) * W, crot = (this.angle * 1.32 + time * 0.012) / (Math.PI * 2) * W;
                const hasClouds = P.clouds > 0;
                const shimmer = time * 0.07;
                for (let k = 0; k < n; k++) {
                    // bilinear lookups: the ground, then the clouds sliding faster
                    let u = D.U[k] + rot; u -= Math.floor(u / W) * W;
                    const v = D.V[k], u0 = u | 0, v0 = v | 0, fu = u - u0, fv = v - v0, u1 = (u0 + 1) % W, v1 = v0 + 1 < H ? v0 + 1 : v0;
                    const i00 = v0 * W + u0, i10 = v0 * W + u1, i01 = v1 * W + u0, i11 = v1 * W + u1;
                    const w00 = (1 - fu) * (1 - fv), w10 = fu * (1 - fv), w01 = (1 - fu) * fv, w11 = fu * fv;
                    let r = T[i00 * 3] * w00 + T[i10 * 3] * w10 + T[i01 * 3] * w01 + T[i11 * 3] * w11;
                    let g = T[i00 * 3 + 1] * w00 + T[i10 * 3 + 1] * w10 + T[i01 * 3 + 1] * w01 + T[i11 * 3 + 1] * w11;
                    let b = T[i00 * 3 + 2] * w00 + T[i10 * 3 + 2] * w10 + T[i01 * 3 + 2] * w01 + T[i11 * 3 + 2] * w11;
                    const gl = G[i00] * w00 + G[i10] * w10 + G[i01] * w01 + G[i11] * w11;
                    const em = E[i00] * w00 + E[i10] * w10 + E[i01] * w01 + E[i11] * w11;
                    const dif = D.D[k], night = (1 - dif) * (1 - dif);
                    // light: shade → sun, a rose dusk along the terminator
                    const dusk = D.DUSK[k];
                    r = r * (P.shade[0] + (P.sun[0] - P.shade[0]) * dif) + P.dusk[0] * dusk * 0.5;
                    g = g * (P.shade[1] + (P.sun[1] - P.shade[1]) * dif) + P.dusk[1] * dusk * 0.5;
                    b = b * (P.shade[2] + (P.sun[2] - P.shade[2]) * dif) + P.dusk[2] * dusk * 0.5;
                    // glassy seas catch the sun
                    const sp = D.SPEC[k] * gl * 0.9;
                    r += sp * P.sun[0]; g += sp * P.sun[1]; b += sp * P.sun[2];
                    // rivers of light on the night side, breathing
                    let glow = em * night;
                    if (glow > 0.01) {
                        glow *= 0.85 + 0.15 * Math.sin(shimmer * 9 + u * 0.05);
                        r += P.lights[0] * glow; g += P.lights[1] * glow; b += P.lights[2] * glow;
                    }
                    if (hasClouds) {
                        let cu = D.U[k] + crot; cu -= Math.floor(cu / W) * W;
                        const c0 = cu | 0, fc = cu - c0, c1 = (c0 + 1) % W;
                        const ca = (CA[v0 * W + c0] * (1 - fc) + CA[v0 * W + c1] * fc) * (1 - fv) + (CA[v1 * W + c0] * (1 - fc) + CA[v1 * W + c1] * fc) * fv;
                        if (ca > 0.002) {
                            const lit = 0.16 + 0.95 * dif;
                            r += (P.cloud[0] * lit + P.dusk[0] * dusk * 0.6 - r) * ca;
                            g += (P.cloud[1] * lit + P.dusk[1] * dusk * 0.6 - g) * ca;
                            b += (P.cloud[2] * lit + P.dusk[2] * dusk * 0.6 - b) * ca;
                        }
                    }
                    // the glass rim, iridescent: its hue drifts with the angle and the hour
                    const rim = D.RIM[k];
                    if (rim > 0.004) {
                        const ph = 6.283 * (D.NZ[k] + shimmer);
                        const ir = 0.5 + 0.5 * Math.cos(ph), ig = 0.5 + 0.5 * Math.cos(ph + 2.07), ib = 0.5 + 0.5 * Math.cos(ph + 4.21);
                        r += rim * (P.rim[0] * 0.75 + ir * 0.35); g += rim * (P.rim[1] * 0.75 + ig * 0.35); b += rim * (P.rim[2] * 0.75 + ib * 0.35);
                    }
                    // soft tone curve, so bright never clips flat
                    r = r / (1 + r * 0.32) * 1.2; g = g / (1 + g * 0.32) * 1.2; b = b / (1 + b * 0.32) * 1.2;
                    const o = D.idx[k] * 4;
                    out[o] = r * 255; out[o + 1] = g * 255; out[o + 2] = b * 255; out[o + 3] = D.A[k] * 255;
                }
                this.cx.putImageData(this.img, 0, 0);
            }

            /* The ring's back or front half: in ring space (turned by the tilt, squashed), the half behind the planet is y < 0. */
            _drawRingHalf(ctx, x, y, R, front, time) {
                const ro = R * this.ringOut;
                ctx.save();
                ctx.translate(x, y); ctx.rotate(-this.tilt); ctx.scale(1, this.ringRatio);
                ctx.beginPath(); ctx.rect(-ro - 2, front ? 0 : -ro - 2, ro * 2 + 4, ro + 2); ctx.clip();
                ctx.globalAlpha *= front ? 0.95 : 0.8;
                ctx.drawImage(this.ringCv, -ro, -ro, ro * 2, ro * 2);
                ctx.restore();
                // glints riding the ring, twinkling; each one sits on its own orbit radius
                const c = Math.cos(-this.tilt), s = Math.sin(-this.tilt);
                for (let i = 0; i < 14; i++) {
                    const th = _dpHash(i, 1, 2, this.P.seed) * 6.283 + time * (0.05 + 0.03 * _dpHash(i, 3, 3, 9));
                    const sy = Math.sin(th);
                    if ((sy >= 0) !== front) continue;
                    const rr = R * (this.ringIn + (this.ringOut - this.ringIn) * (0.1 + 0.8 * _dpHash(i, 5, 7, 11)));
                    const lx = Math.cos(th) * rr, ly = sy * rr * this.ringRatio;
                    const tw = 0.5 + 0.5 * Math.sin(time * (1.3 + _dpHash(i, 8, 1, 2) * 2) + i * 1.7);
                    const col = this.P.ring[i % this.P.ring.length];
                    const hex = '#' + col.map(v => Math.round(Math.min(1, v) * 255).toString(16).padStart(2, '0')).join('');
                    drawLensGlare(ctx, x + lx * c - ly * s, y + lx * s + ly * c, hex, R * (0.07 + 0.08 * tw), 0.35 + 0.55 * tw);
                }
            }

            /* The atmosphere: a broad halo leaning towards the sun, under the planet. */
            _drawHalo(ctx, x, y, R) {
                const L = this.light, ox = x + L[0] * R * 0.1, oy = y - L[1] * R * 0.1;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                let g = ctx.createRadialGradient(ox, oy, R * 0.85, ox, oy, R * 1.55);
                g.addColorStop(0, `rgba(${this.P.halo}, 0.5)`); g.addColorStop(0.25, `rgba(${this.P.halo}, 0.2)`); g.addColorStop(1, `rgba(${this.P.halo}, 0)`);
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox, oy, R * 1.55, 0, 6.283); ctx.fill();
                g = ctx.createRadialGradient(x - L[0] * R * 0.15, y + L[1] * R * 0.15, R * 0.9, x, y, R * 1.3);
                g.addColorStop(0, `rgba(${this.P.halo2}, 0.22)`); g.addColorStop(1, `rgba(${this.P.halo2}, 0)`);
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 1.3, 0, 6.283); ctx.fill();
                ctx.restore();
            }
            /* A thin bright limb over the disc's edge. */
            _drawLimb(ctx, x, y, R) {
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                const g = ctx.createRadialGradient(x, y, R * 0.93, x, y, R * 1.06);
                g.addColorStop(0, `rgba(${this.P.halo}, 0)`); g.addColorStop(0.6, `rgba(${this.P.halo}, 0.35)`); g.addColorStop(1, `rgba(${this.P.halo}, 0)`);
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 1.06, 0, 6.283); ctx.fill();
                ctx.restore();
            }

            /** The whole planet centred at x, y with screen radius R. `moons` are drawn behind or in front by their orbits. */
            draw(ctx, x, y, R, time = 0, moons = null) {
                const placed = moons ? moons.map(m => m.place(x, y, R, time, this)) : [];
                for (const m of placed) if (m.behind) m.moon.drawMoon(ctx, m, time);
                this._drawHalo(ctx, x, y, R);
                if (this.ring) this._drawRingHalf(ctx, x, y, R, false, time);
                this._render(time);
                const S = this.disc.S, sc = R / this.res;
                ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(this.cv, x - S / 2 * sc, y - S / 2 * sc, S * sc, S * sc);
                ctx.restore();
                this._drawLimb(ctx, x, y, R);
                if (this.ring) this._drawRingHalf(ctx, x, y, R, true, time);
                for (const m of placed) if (!m.behind) m.moon.drawMoon(ctx, m, time);
            }
        }

        /** A small moon on an orbit in its planet's ring plane (a = orbit radius in planet radii, size in planet radii). */
        class DreamMoon {
            constructor(opts) {
                this.planet = new DreamPlanet({ palette: opts.palette, res: opts.res || 40, spin: opts.spin || 2.2, ring: false, tilt: opts.tilt || 0.2, light: opts.light });
                this.a = opts.a || 2.8; this.size = opts.size || 0.16; this.speed = opts.speed || 0.12; this.phase = opts.phase || 0; this.lift = opts.lift || 0;
            }
            place(x, y, R, time, host) {
                const th = this.phase + time * this.speed, ratio = host.ringRatio || 0.3, c = Math.cos(-host.tilt), s = Math.sin(-host.tilt);
                const lx = Math.cos(th) * R * this.a, ly = Math.sin(th) * R * this.a * ratio - R * this.lift;
                const depth = Math.sin(th);
                return { moon: this, behind: depth < 0, x: x + lx * c - ly * s, y: y + lx * s + ly * c, r: R * this.size * (1 + depth * 0.12) };
            }
            drawMoon(ctx, m, time) { this.planet.angle = time * this.planet.spin * Math.PI * 2 / 60; this.planet.draw(ctx, m.x, m.y, m.r, time); }
        }

        // =====================================================================
        //  DREAM STAR MAP — the planet over a nebula sky, as a star chart
        // =====================================================================
        const DreamStarMap = {
            WORLDS: ['reverie', 'lullaby', 'hush'],
            _bakeSky(seed, W, H) {
                // a nebula at low resolution, smoothed up when drawn: two warped layers of colour
                const w = Math.ceil(W / 6), h = Math.ceil(H / 6), img = new ImageData(w, h), d = img.data;
                const P = DREAM_PALETTES[this.WORLDS[this.world]];
                for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                    const u = x / w * 3.2, v = y / h * 3.2 * h / w;
                    const q = _dpFbm(u, v, 0.3, seed, 4), n = _dpFbm(u + q * 2.2, v + q * 1.6, 1.1, seed + 9, 5), m = _dpFbm(u * 1.7 - q, v * 1.7, 2.3, seed + 17, 4);
                    const o = (y * w + x) * 4;
                    const a1 = _dpSmooth(0.45, 0.8, n), a2 = _dpSmooth(0.5, 0.82, m);
                    const hr = P.halo.split(',').map(Number), h2 = P.halo2.split(',').map(Number);
                    d[o] = 14 + hr[0] * a1 * 0.42 + h2[0] * a2 * 0.38;
                    d[o + 1] = 8 + hr[1] * a1 * 0.30 + h2[1] * a2 * 0.22;
                    d[o + 2] = 30 + hr[2] * a1 * 0.42 + h2[2] * a2 * 0.40;
                    d[o + 3] = 255;
                }
                const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
                cv.getContext('2d').putImageData(img, 0, 0);
                return cv;
            },
            _makeStars(seed, W, H) {
                const stars = [];
                for (let i = 0; i < Math.round(W * H / 2600); i++) {
                    const r = _dpHash(i, 1, 0, seed);
                    stars.push({ x: _dpHash(i, 2, 0, seed) * W, y: _dpHash(i, 3, 0, seed) * H, s: 0.4 + Math.pow(r, 6) * 2.2, tw: _dpHash(i, 4, 0, seed) * 6.28, hue: _dpHash(i, 5, 0, seed) });
                }
                // a constellation: seven bright stars on a gentle arc, read as a route on the chart
                const route = [];
                for (let i = 0; i < 7; i++) {
                    const t = i / 6;
                    route.push({ x: W * (0.08 + t * 0.34 + (_dpHash(i, 9, 1, seed) - 0.5) * 0.05), y: H * (0.18 + Math.sin(t * 3.0) * 0.12 + (_dpHash(i, 9, 2, seed) - 0.5) * 0.06), s: 1.6 + _dpHash(i, 9, 3, seed) * 1.4 });
                }
                const motes = [];
                for (let i = 0; i < 46; i++) motes.push({ x: _dpHash(i, 7, 1, seed) * W, y: _dpHash(i, 7, 2, seed) * H, r: 1 + _dpHash(i, 7, 3, seed) * 3.5, v: 6 + _dpHash(i, 7, 4, seed) * 14, ph: _dpHash(i, 7, 5, seed) * 6.28 });
                return { stars, route, motes };
            },

            /** Open the star map over the game. opts: world (0…2), time (s), paused (no animation: for stills). */
            open(opts = {}) {
                if (this.cv) this.close();
                const dpr = Math.min(2, window.devicePixelRatio || 1);
                const cv = this.cv = document.createElement('canvas');
                cv.id = 'dream-star-map';
                cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:100000;touch-action:none;cursor:grab;background:#05030c';
                document.body.appendChild(cv);
                this.dpr = dpr; this.world = opts.world || 0; this.time = opts.time || 0; this.paused = !!opts.paused;
                this._resize();
                this._setWorld(this.world);
                // drag spins the planet; a tap at the edges changes world; Esc / ✕ closes
                let drag = null;
                cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, a: this.planet.angle, moved: 0 }; cv.setPointerCapture(e.pointerId); });
                cv.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x; drag.moved = Math.max(drag.moved, Math.abs(dx)); this.planet.angle = drag.a - dx * 0.008; });
                cv.addEventListener('pointerup', e => {
                    const d = drag; drag = null; if (!d || d.moved > 6) return;
                    const w = cv.clientWidth;
                    if (e.clientX > w - 56 && e.clientY < 56) return this.close();
                    if (e.clientX < w * 0.18) this._setWorld((this.world + this.WORLDS.length - 1) % this.WORLDS.length);
                    else if (e.clientX > w * 0.82) this._setWorld((this.world + 1) % this.WORLDS.length);
                });
                this._key = e => { if (e.key === 'Escape') this.close(); else if (e.key === 'ArrowRight') this._setWorld((this.world + 1) % 3); else if (e.key === 'ArrowLeft') this._setWorld((this.world + 2) % 3); };
                this._onResize = () => this._resize();
                window.addEventListener('keydown', this._key); window.addEventListener('resize', this._onResize);
                let last = performance.now();
                const tick = (now) => {
                    if (!this.cv) return;
                    const dt = Math.min(0.05, (now - last) / 1000); last = now;
                    if (!this.paused) { this.time += dt; if (!drag) this.planet.update(dt); }
                    this.draw();
                    this._raf = requestAnimationFrame(tick);
                };
                this._raf = requestAnimationFrame(tick);
                return this;
            },
            close() {
                if (!this.cv) return;
                cancelAnimationFrame(this._raf);
                window.removeEventListener('keydown', this._key); window.removeEventListener('resize', this._onResize);
                this.cv.remove(); this.cv = null;
            },
            _resize() {
                const cv = this.cv, W = cv.clientWidth || innerWidth, H = cv.clientHeight || innerHeight;
                cv.width = Math.round(W * this.dpr); cv.height = Math.round(H * this.dpr);
                this.W = W; this.H = H;
                if (this.planet) this._setWorld(this.world);
            },
            _setWorld(i) {
                this.world = i;
                const key = this.WORLDS[i], P = DREAM_PALETTES[key], R = this._planetR();
                const res = Math.min(170, Math.round(R * this.dpr * 0.8));
                const keep = this.planet ? this.planet.angle : 0.8;
                this.planet = new DreamPlanet({ palette: key, res, ring: true, tilt: [-0.38, 0.3, -0.22][i], spin: 0.9 });
                this.planet.angle = keep;
                this.moons = [
                    new DreamMoon({ palette: 'pearl', a: 2.9, size: 0.15, speed: 0.11, phase: 1.2, lift: 0.08 }),
                    new DreamMoon({ palette: 'ember', a: 3.6, size: 0.1, speed: -0.07, phase: 5.4, lift: -0.1 })
                ];
                this.sky = this._bakeSky(P.seed + 5, this.W, this.H);
                this.field = this._makeStars(P.seed + 1, this.W, this.H);
            },
            _planetR() { return Math.min(this.W * 0.2, this.H * 0.3); },

            draw() {
                const ctx = this.cv.getContext('2d'), W = this.W, H = this.H, t = this.time, P = DREAM_PALETTES[this.WORLDS[this.world]];
                ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
                ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
                // the nebula, breathing and drifting
                ctx.fillStyle = '#07041a'; ctx.fillRect(0, 0, W, H);
                ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
                const drift = Math.sin(t * 0.05) * 14;
                ctx.globalAlpha = 0.95; ctx.drawImage(this.sky, -20 + drift, -14, W + 40, H + 28);
                ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18 + 0.06 * Math.sin(t * 0.3);
                ctx.drawImage(this.sky, W + 30 - drift * 1.6, -30, -(W + 60), H + 60);          // mirrored, for a second slow layer
                ctx.globalAlpha = 1;
                // a dimension rift: a soft ribbon of light waving across the sky
                for (let k = 0; k < 2; k++) {
                    ctx.beginPath();
                    for (let i = 0; i <= 48; i++) {
                        const x = i / 48 * W, y = H * (0.72 - k * 0.08) - Math.sin(i / 48 * 5 + t * 0.25 + k) * H * 0.07 - i / 48 * H * 0.3;
                        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
                    }
                    ctx.strokeStyle = `rgba(${k ? P.halo2 : P.halo}, 0.035)`; ctx.lineWidth = H * 0.16; ctx.stroke();
                    ctx.strokeStyle = `rgba(${k ? P.halo2 : P.halo}, 0.04)`; ctx.lineWidth = H * 0.07; ctx.stroke();
                    ctx.strokeStyle = `rgba(${k ? P.halo2 : P.halo}, 0.05)`; ctx.lineWidth = H * 0.025; ctx.stroke();
                }
                // stars, twinkling
                for (const s of this.field.stars) {
                    const a = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.7 + s.tw));
                    ctx.fillStyle = s.hue < 0.33 ? `rgba(255,236,250,${a})` : s.hue < 0.66 ? `rgba(206,232,255,${a})` : `rgba(255,240,206,${a})`;
                    ctx.fillRect(s.x, s.y, s.s, s.s);
                }
                // the chart: a constellation route with rings at its stops, and its stars glaring
                const rt = this.field.route;
                ctx.globalCompositeOperation = 'source-over';
                ctx.setLineDash([3, 6]); ctx.lineDashOffset = -t * 6; ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(255, 222, 160, 0.45)';
                ctx.beginPath(); rt.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
                ctx.setLineDash([]);
                rt.forEach((p, i) => {
                    ctx.strokeStyle = 'rgba(255, 222, 160, 0.35)';
                    ctx.beginPath(); ctx.arc(p.x, p.y, 7 + 2 * Math.sin(t * 1.2 + i), 0, 6.283); ctx.stroke();
                    drawLensGlare(ctx, p.x, p.y, i % 2 ? '#ffd9a0' : '#cfe6ff', 12 + p.s * 5, 0.75 + 0.25 * Math.sin(t * 2 + i));
                });
                // the planet, its moons, and the sun's glare beyond it
                const R = this._planetR(), px = W * 0.56, py = H * 0.54 + Math.sin(t * 0.4) * R * 0.025;
                const L = this.planet.light;
                drawLensGlare(ctx, px + L[0] * R * 3.1, py - L[1] * R * 3.1, '#fff0dc', R * 0.9, 0.9);
                this.planet.draw(ctx, px, py, R, t, this.moons);
                // dream motes rising
                ctx.globalCompositeOperation = 'lighter';
                for (const m of this.field.motes) {
                    const y = ((m.y - t * m.v) % (H + 20) + H + 20) % (H + 20) - 10, x = m.x + Math.sin(t * 0.6 + m.ph) * 12;
                    ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 1.5 + m.ph);
                    drawGlow(ctx, x, y, m.r * 3, m.ph < 3 ? P.halo : P.halo2, 0.3);
                }
                ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
                // vignette
                const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
                vg.addColorStop(0, 'rgba(4,2,12,0)'); vg.addColorStop(1, 'rgba(4,2,12,0.72)');
                ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
                // labels
                ctx.font = '600 11px "Segoe UI", system-ui, sans-serif'; ctx.textBaseline = 'top';
                ctx.fillStyle = 'rgba(255, 222, 160, 0.85)'; ctx.fillText('DREAM STAR MAP', 18, 16);
                ctx.font = 'italic 20px Georgia, serif'; ctx.fillStyle = 'rgba(245, 236, 255, 0.95)'; ctx.fillText(P.name, 18, 32);
                ctx.font = '11px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = 'rgba(220, 210, 255, 0.55)';
                ctx.fillText('drag to turn it  ·  tap the sides for another world', 18, H - 26);
                ctx.textAlign = 'right'; ctx.font = '18px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = 'rgba(245, 236, 255, 0.7)';
                ctx.fillText('✕', W - 18, 14); ctx.textAlign = 'left';
                ctx.font = '22px Georgia, serif'; ctx.fillStyle = 'rgba(245, 236, 255, 0.35)';
                ctx.fillText('‹', 14, H / 2 - 12); ctx.textAlign = 'right'; ctx.fillText('›', W - 14, H / 2 - 12); ctx.textAlign = 'left';
            }
        };
