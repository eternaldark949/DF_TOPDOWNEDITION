        /* =====================================================================
           PAINTED PORTRAITS — the realistic bust behind drawCharacterPortrait()
           ---------------------------------------------------------------------
           Painted in a 1000×1000 space (face centre 500,470; face radii 158×210),
           scaled so the face fills the frame. Soft forms are blurred blobs and
           lines (canvas filters), hair is hundreds of strands clipped to its
           silhouette, and every part is lit like the room: a key light from the
           upper right and a rim of the room's colour round the left edges.

           The still parts (backdrop, back hair, body and clothes, face modelling,
           nose, front hair, hat) are painted once per look and size and cached.
           The eyes, brows and mouth carry the expression (ui/expressions.js),
           blinking and talking, so they're painted fresh on every call.

           Browsers without canvas filters get the classic renderer
           (drawCharacterPortraitClassic in ui/humanoid-render.js).
           ===================================================================== */
        const RealPortrait = (() => {
            const TAU = Math.PI * 2;
            const CX = 500, CY = 470, FW = 158, FH = 210;
            const ZOOM = 1.25;                     // the face fills the frame as the classic bust did
            let S = 1, OX = 0, OY = 0, W = 0, H = 0, seed = 1;

            const hexA = (h, d) => { if (!/^#[0-9a-f]{6}$/i.test(h || '')) h = d; const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
            const rgb = (c, a = 1) => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;
            const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
            const mul = (a, k) => [Math.min(255, a[0] * k), Math.min(255, a[1] * k), Math.min(255, a[2] * k)];
            const lum = c => (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;
            const lerp = (a, b, t) => a + (b - a) * t;
            const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
            const R = (a, b) => a + (b - a) * rnd();
            const hash = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 2147483647; return h || 7; };
            // Canvas filters blur in pixels, whatever the transform: radii are given in the 1000 space and scaled here
            const blurF = b => { const v = b * S; return v < 0.3 ? 'none' : `blur(${v.toFixed(2)}px)`; };

            /** Does this browser blur through ctx.filter? (Without it every soft form would be a hard blob.) */
            let _ok = null;
            function supported() {
                if (_ok !== null) return _ok;
                try {
                    const c = document.createElement('canvas'); c.width = c.height = 9;
                    const x = c.getContext('2d');
                    x.filter = 'blur(2px)'; x.fillStyle = '#000'; x.fillRect(4, 0, 1, 9);
                    _ok = x.getImageData(1, 4, 1, 1).data[3] > 0;
                } catch (e) { _ok = false; }
                return _ok;
            }

            // ── Layers ── each part is painted flat in its own layer, shaded inside its own shape, then laid down
            const pool = [];
            function layer(i) {
                let c = pool[i];
                if (!c) c = pool[i] = document.createElement('canvas');
                if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
                const x = c.getContext('2d');
                x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.filter = 'none';
                x.clearRect(0, 0, W, H);
                x.setTransform(S, 0, 0, S, OX, OY);
                return c;
            }
            function canvasFor() {
                const c = document.createElement('canvas'); c.width = W; c.height = H;
                c.getContext('2d').setTransform(S, 0, 0, S, OX, OY);
                return c;
            }
            /** Lay a layer down on c, pixel for pixel. */
            function put(c, lay, a = 1) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = a; c.drawImage(lay, 0, 0); c.restore(); }
            /** Run fn in the canvas's own pixels, with P in pixels too: wardrobe pieces draw as they always have. */
            function inPixels(c, fn) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); fn(); c.restore(); }
            function pixelP(bw) {
                return { cx: OX + CX * S, cy: OY + CY * S, fw: FW * S, fh: FH * S, w: W, h: H,
                         eyeY: OY + (CY - FH * 0.16) * S, eyeSpacing: 72 * S, bw };
            }

            // ── Brushes ──
            function blob(c, x, y, rx, ry, col, a, blur, rot = 0, op) {
                c.save();
                c.filter = blurF(blur);
                if (op) c.globalCompositeOperation = op;
                c.fillStyle = rgb(col, a);
                c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); c.fill();
                c.restore();
            }
            function softLine(c, pts, col, a, w, blur, op) {
                c.save(); c.filter = blurF(blur); if (op) c.globalCompositeOperation = op;
                c.strokeStyle = rgb(col, a); c.lineWidth = w; c.lineCap = 'round';
                c.beginPath(); c.moveTo(pts[0], pts[1]);
                if (pts.length === 6) c.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]);
                else c.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
                c.stroke(); c.restore();
            }
            /** Pores and grain inside the current clip, never finer than a pixel. */
            function grain(c, col, a) {
                const px = 1 / S, n = Math.min(2600, Math.round(104000 * S * S * 0.35));
                for (let i = 0; i < n; i++) {
                    const x = R(CX - FW * 1.1, CX + FW * 1.1), y = R(CY - FH * 1.1, CY + FH * 1.1);
                    c.fillStyle = rgb(rnd() < 0.5 ? mul(col, 0.8) : mix(col, [255, 255, 255], 0.25), a * R(0.4, 1));
                    c.fillRect(x, y, Math.max(px, R(1, 2.4)), Math.max(px, R(1, 2.4)));
                }
            }
            /** A rim of the room's light along the left edges of whatever the layer holds: the shape, less itself shifted right. */
            function rimOn(lay, rim, d, a) {
                const t = layer(8).getContext('2d');
                t.setTransform(1, 0, 0, 1, 0, 0);
                t.drawImage(lay, 0, 0);
                t.globalCompositeOperation = 'source-in'; t.fillStyle = rgb(rim); t.fillRect(0, 0, W, H);
                t.globalCompositeOperation = 'destination-out'; t.drawImage(lay, d * S, d * 0.35 * S);
                const o = layer(9).getContext('2d');
                o.setTransform(1, 0, 0, 1, 0, 0); o.filter = blurF(d * 0.35); o.drawImage(t.canvas, 0, 0); o.filter = 'none';
                const lc = lay.getContext('2d');
                lc.save(); lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-atop'; lc.globalAlpha = a; lc.drawImage(o.canvas, 0, 0); lc.restore();
            }
            /** Shade a layer inside its own shape with a gradient or colour. */
            function atop(c, style, a = 1) {
                c.save(); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = a; c.fillStyle = style; c.fillRect(-1500, -500, 4000, 5000); c.restore();
            }

            function facePath(c, k = 1, jaw = 0) {
                c.beginPath();
                c.moveTo(CX, CY - FH);
                for (const s of [1, -1]) {
                    const X = v => CX + s * v * FW * k;
                    if (s < 0) c.moveTo(CX, CY - FH);
                    c.bezierCurveTo(X(0.6), CY - FH, X(0.96), CY - FH * 0.74, X(0.99), CY - FH * 0.28);
                    c.bezierCurveTo(X(1.01), CY + FH * 0.04, X(0.96 + jaw * 0.03), CY + FH * 0.3, X(0.84 + jaw * 0.07), CY + FH * 0.56);
                    c.bezierCurveTo(X(0.68 + jaw * 0.1), CY + FH * 0.84, X(0.36 + jaw * 0.12), CY + FH * 1.01, CX, CY + FH * 1.03);
                }
            }

            // ── Backdrop: the room's colour behind them, brightest on the rim side ──
            function background(c, rim) {
                c.save();
                c.setTransform(1, 0, 0, 1, 0, 0); c.beginPath(); c.arc(W / 2, H / 2, Math.min(W, H) / 2, 0, TAU); c.clip();
                c.setTransform(S, 0, 0, S, OX, OY);
                const g = c.createRadialGradient(240, 300, 0, 240, 300, 900);
                g.addColorStop(0, rgb(rim, 0.75)); g.addColorStop(0.45, rgb(mul(rim, 0.35), 0.9)); g.addColorStop(1, rgb([8, 4, 12], 1));
                c.fillStyle = g; c.fillRect(-500, -500, 2000, 2000);
                const v = c.createRadialGradient(500, 500, 300, 500, 500, 760);
                v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
                c.fillStyle = v; c.fillRect(-500, -500, 2000, 2000);
                c.restore();
            }

            // ════════════════ HAIR ════════════════
            // Each style: (c, L, part) for part 'back' (behind the body and face) and 'front' (over the face).
            // Strands are clipped to the style's silhouette so the hair reads as a mass, not string.
            function strandSet(c, list, base, sheen) {
                const dark = mul(base, 0.45), light = mix(base, [255, 255, 255], base[0] + base[1] + base[2] < 150 ? 0.32 : 0.45);
                c.lineCap = 'round';
                for (const s of list) {
                    const t = rnd();
                    c.strokeStyle = rgb(t < 0.45 ? dark : t < 0.85 ? base : mix(base, light, 0.5), R(0.35, 0.8));
                    c.lineWidth = s[8] * R(0.6, 1.3);
                    c.beginPath(); c.moveTo(s[0], s[1]); c.bezierCurveTo(s[2], s[3], s[4], s[5], s[6], s[7]); c.stroke();
                }
                if (sheen) sheenArc(c, base, sheen);
            }
            /** Light gliding over the crown: a soft broad band, brightest toward the key light. */
            function sheenArc(c, base, sh) {
                const light = mix(base, [255, 255, 255], base[0] + base[1] + base[2] < 150 ? 0.32 : 0.45);
                c.save();
                c.globalCompositeOperation = 'screen'; c.filter = blurF(sh.t * 0.5);
                c.strokeStyle = rgb(light, 0.22); c.lineWidth = sh.t * 1.4;
                c.beginPath(); c.ellipse(sh.x, sh.y, sh.rx * 0.92, sh.ry * 0.9, 0, Math.PI * (sh.a0 || 1.25), Math.PI * (sh.a1 || 1.85)); c.stroke();
                c.filter = blurF(sh.t * 0.2); c.strokeStyle = rgb(light, 0.2); c.lineWidth = sh.t * 0.45;
                c.beginPath(); c.ellipse(sh.x, sh.y, sh.rx * 0.92, sh.ry * 0.9, 0, Math.PI * ((sh.a0 || 1.25) + 0.13), Math.PI * ((sh.a1 || 1.85) - 0.1)); c.stroke();
                c.restore();
            }
            /** The sides turn away from the light and the ends fall into shade. */
            function hairDepth(c, base, bottom) {
                let g = c.createLinearGradient(CX - FW * 1.5, 0, CX + FW * 1.5, 0);
                g.addColorStop(0, rgb(mul(base, 0.45))); g.addColorStop(0.3, rgb(base, 0)); g.addColorStop(0.75, rgb(base, 0)); g.addColorStop(1, rgb(mul(base, 0.6)));
                c.fillStyle = g; c.fillRect(-500, -500, 2000, 2000);
                if (bottom) {
                    g = c.createLinearGradient(0, bottom[0], 0, bottom[1]); g.addColorStop(0, rgb(base, 0)); g.addColorStop(1, rgb(mul(base, 0.4), 0.8));
                    c.fillStyle = g; c.fillRect(-500, -500, 2000, 2000);
                }
            }
            function strays(c, base, n, x0, x1, y0, y1) {
                c.lineWidth = 0.8; c.strokeStyle = rgb(mix(base, [255, 255, 255], 0.15), 0.25);
                for (let i = 0; i < n; i++) {
                    const s = rnd() < 0.5 ? -1 : 1, y = R(y0, y1), x = CX + s * FW * R(x0, x1);
                    c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + s * R(6, 16), y + 30, x + s * R(-4, 14), y + 70, x + s * R(4, 18), y + R(90, 140)); c.stroke();
                }
            }

            // Long: a parting, strands over the skull and down past the shoulders
            function longShape(c, which) {
                const top = CY - FH - 40, px = CX + 22;
                c.beginPath();
                if (which === 'back') {
                    c.moveTo(CX - FW * 1.2, CY - FH * 0.7);
                    c.bezierCurveTo(CX - FW * 1.55, CY + FH * 0.4, CX - FW * 1.6, CY + FH * 1.5, CX - FW * 1.5, CY + FH * 2.2);
                    c.lineTo(CX + FW * 1.5, CY + FH * 2.2);
                    c.bezierCurveTo(CX + FW * 1.6, CY + FH * 1.5, CX + FW * 1.55, CY + FH * 0.4, CX + FW * 1.2, CY - FH * 0.7);
                    c.bezierCurveTo(CX + FW * 0.8, top - 60, CX - FW * 0.8, top - 60, CX - FW * 1.2, CY - FH * 0.7);
                    c.closePath(); return;
                }
                c.moveTo(CX - FW * 1.42, CY + FH * 1.9);
                c.bezierCurveTo(CX - FW * 1.4, CY + FH * 0.7, CX - FW * 1.36, CY - FH * 0.4, CX - FW * 1.08, CY - FH * 0.92);
                c.bezierCurveTo(CX - FW * 0.72, top - 34, CX + FW * 0.72, top - 34, CX + FW * 1.08, CY - FH * 0.92);
                c.bezierCurveTo(CX + FW * 1.36, CY - FH * 0.4, CX + FW * 1.4, CY + FH * 0.7, CX + FW * 1.42, CY + FH * 1.9);
                c.quadraticCurveTo(CX + FW * 1.1, CY + FH * 2.12, CX + FW * 0.84, CY + FH * 1.92);
                c.bezierCurveTo(CX + FW * 0.86, CY + FH * 0.9, CX + FW * 0.97, CY - FH * 0.1, CX + FW * 0.7, CY - FH * 0.6);
                c.bezierCurveTo(CX + FW * 0.45, CY - FH * 0.86, px + 6, CY - FH * 0.95, px, CY - FH * 0.96);
                c.bezierCurveTo(px - 30, CY - FH * 0.95, CX - FW * 0.5, CY - FH * 0.86, CX - FW * 0.74, CY - FH * 0.56);
                c.bezierCurveTo(CX - FW * 0.99, CY - FH * 0.1, CX - FW * 0.9, CY + FH * 0.9, CX - FW * 0.84, CY + FH * 1.92);
                c.quadraticCurveTo(CX - FW * 1.1, CY + FH * 2.12, CX - FW * 1.42, CY + FH * 1.9);
                c.closePath();
            }
            function long(c, L, part) {
                const base = L.hair, list = [];
                const px = CX + 22, top = CY - FH - 40;
                if (part === 'back') {
                    const deep = mul(base, base[0] + base[1] + base[2] < 150 ? 0.6 : 0.72);
                    longShape(c, 'back');
                    const g = c.createLinearGradient(0, CY - FH, 0, CY + FH * 2.2); g.addColorStop(0, rgb(deep)); g.addColorStop(1, rgb(mul(deep, 0.55)));
                    c.fillStyle = g; c.fill();
                    c.save(); longShape(c, 'back'); c.clip();
                    for (let i = 0; i < 520; i++) {
                        const s = rnd() < 0.5 ? -1 : 1, u = R(0.8, 1.6);
                        const x0 = CX + s * FW * u * 0.8, y0 = CY - FH * R(0.4, 0.9);
                        list.push([x0, y0, x0 + s * R(20, 60), CY + FH * 0.4, x0 + s * R(10, 50), CY + FH * 1.3, x0 + s * R(0, 40), CY + FH * 2.3, R(1.5, 3)]);
                    }
                    strandSet(c, list, deep);
                    c.restore();
                    return;
                }
                longShape(c, 'front'); c.fillStyle = rgb(base); c.fill();
                c.save(); longShape(c, 'front'); c.clip();
                hairDepth(c, base);
                for (let i = 0; i < 900; i++) {
                    const s = i % 2 ? 1 : -1, u = rnd();
                    const x0 = px + R(-5, 5), y0 = top + R(-4, 14);
                    const sideX = CX + s * FW * (0.82 + u * 0.5);
                    list.push([x0, y0, x0 + s * FW * (0.4 + u * 0.55), top + R(5, 40), sideX + s * R(25, 55), CY - FH * R(0.55, 0.15),
                        sideX + s * R(-15, 20), CY + FH * R(1.4, 2.0), R(1.1, 2.4)]);
                }
                strandSet(c, list, base, { x: CX + 12, y: CY - FH * 0.52, rx: FW * 1.12, ry: FH * 0.6, t: 30 });
                hairDepth(c, base, [CY + FH * 1.2, CY + FH * 2]);
                c.restore();
                strays(c, base, 14, 1.25, 1.33, CY - FH * 0.8, CY + FH * 0.6);
            }

            // Demon dancer: long and wild, with tendrils flung out on the air
            function demon_dancer(c, L, part) {
                long(c, L, part);
                if (part !== 'back') return;
                const base = L.hair;
                for (let k = 0; k < 6; k++) {
                    const s = k % 2 ? 1 : -1, u = (k >> 1) / 2;
                    const x0 = CX + s * FW * (0.8 + u * 0.2), y0 = CY - FH * (0.9 - u * 0.6);
                    const x1 = CX + s * FW * (1.9 + u * 0.2), y1 = CY - FH * (0.3 - u * 1.0);
                    const cxp = CX + s * FW * (1.7 + u * 0.1), cyp = CY - FH * (1.1 - u * 0.9);
                    for (let i = 0; i < 40; i++) {
                        const t = R(-1, 1), wd = 26 * (1 - Math.abs(t) * 0.5);
                        c.strokeStyle = rgb(rnd() < 0.5 ? mul(base, 0.5) : rnd() < 0.8 ? base : mix(base, [255, 255, 255], 0.3), R(0.3, 0.75));
                        c.lineWidth = R(1, 2.6);
                        c.beginPath(); c.moveTo(x0 + t * wd * 0.6, y0 + t * wd * 0.4);
                        c.quadraticCurveTo(cxp + t * wd, cyp + t * wd * 0.6, x1 + t * wd * 0.2 + R(-10, 10), y1 + t * wd * 0.15 + R(-10, 10)); c.stroke();
                    }
                }
            }

            // Short: close over the skull. On men it's combed up and back from a natural hairline; on women a
            // pixie, its fringe swept from the parting across the brow
            function shortShape(c, fem) {
                const sb = fem ? CY + FH * 0.22 : CY - FH * 0.12;     // where the sides end, in front of the ears
                c.beginPath();
                c.moveTo(CX - FW * 1.02, sb);
                c.bezierCurveTo(CX - FW * 1.12, CY - FH * 0.8, CX - FW * 0.8, CY - FH * (fem ? 1.33 : 1.36), CX, CY - FH * (fem ? 1.34 : 1.38));
                c.bezierCurveTo(CX + FW * 0.8, CY - FH * (fem ? 1.33 : 1.36), CX + FW * 1.12, CY - FH * 0.8, CX + FW * 1.02, sb);
                c.lineTo(CX + FW * 0.94, sb);
                if (fem) {
                    c.bezierCurveTo(CX + FW * 0.95, CY - FH * 0.38, CX + FW * 0.86, CY - FH * 0.72, CX + FW * 0.5, CY - FH * 0.78);
                    c.bezierCurveTo(CX + FW * 0.1, CY - FH * 0.8, CX - FW * 0.4, CY - FH * 0.62, CX - FW * 0.8, CY - FH * 0.42);
                    c.bezierCurveTo(CX - FW * 0.9, CY - FH * 0.3, CX - FW * 0.95, CY - FH * 0.1, CX - FW * 0.94, sb);
                } else {   // the temples recede a little either side of the front
                    c.bezierCurveTo(CX + FW * 0.95, CY - FH * 0.42, CX + FW * 0.88, CY - FH * 0.62, CX + FW * 0.74, CY - FH * 0.7);
                    c.quadraticCurveTo(CX + FW * 0.6, CY - FH * 0.86, CX + FW * 0.4, CY - FH * 0.84);
                    c.bezierCurveTo(CX + FW * 0.15, CY - FH * 0.86, CX - FW * 0.15, CY - FH * 0.86, CX - FW * 0.4, CY - FH * 0.84);
                    c.quadraticCurveTo(CX - FW * 0.6, CY - FH * 0.86, CX - FW * 0.74, CY - FH * 0.7);
                    c.bezierCurveTo(CX - FW * 0.88, CY - FH * 0.62, CX - FW * 0.95, CY - FH * 0.42, CX - FW * 0.94, sb);
                }
                c.closePath();
            }
            function short(c, L, part) {
                if (part === 'back') return;
                const base = L.hair, fem = !L.masc, list = [];
                shortShape(c, fem); c.fillStyle = rgb(mul(base, 0.85)); c.fill();
                c.save(); shortShape(c, fem); c.clip();
                if (fem) {
                    const px = CX + FW * 0.42;
                    for (let i = 0; i < 700; i++) {
                        const x0 = px + R(-6, 6), y0 = CY - FH * R(1.36, 1.2);
                        const th = rnd() < 0.7 ? R(Math.PI * 0.85, Math.PI * 1.55) : R(Math.PI * 1.55, Math.PI * 2.1);
                        const ex = CX + Math.cos(th) * FW * 1.1, ey = CY - FH * 0.1 + Math.sin(th) * FH * 0.62;
                        list.push([x0, y0, x0 + (ex - x0) * 0.35, y0 - 14, ex + (ex - CX) * 0.1, ey - FH * 0.35, ex, ey + R(0, 30), R(1.2, 2.6)]);
                    }
                } else {
                    for (let i = 0; i < 760; i++) {   // from the hairline, up and back over the crown, a little to one side
                        const u = R(-1.05, 1.05), x0 = CX + u * FW * 0.95, y0 = CY - FH * (0.86 - Math.max(0, Math.abs(u) - 0.45) * 0.5) + R(0, 12);
                        const ex = CX + u * FW * 0.7 - FW * 0.15, ey = CY - FH * R(1.45, 1.3);
                        list.push([x0, y0 + 8, x0 + R(-4, 4), y0 - FH * 0.2, ex + R(-10, 10), ey + FH * 0.1, ex, ey, R(1.2, 2.6)]);
                    }
                }
                strandSet(c, list, base);
                hairDepth(c, base);
                sheenArc(c, base, { x: CX + 6, y: CY - FH * 0.62, rx: FW * 1.0, ry: FH * 0.62, t: 22 });
                c.restore();
                if (!fem) {   // a hairline thins out into the skin rather than stopping on a line
                    c.save(); c.globalCompositeOperation = 'destination-out'; c.filter = blurF(5);
                    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 9; c.lineCap = 'round';
                    c.beginPath(); c.moveTo(CX - FW * 0.9, CY - FH * 0.3);
                    c.bezierCurveTo(CX - FW * 0.92, CY - FH * 0.55, CX - FW * 0.84, CY - FH * 0.66, CX - FW * 0.74, CY - FH * 0.7);
                    c.quadraticCurveTo(CX - FW * 0.6, CY - FH * 0.86, CX - FW * 0.4, CY - FH * 0.84);
                    c.bezierCurveTo(CX - FW * 0.15, CY - FH * 0.86, CX + FW * 0.15, CY - FH * 0.86, CX + FW * 0.4, CY - FH * 0.84);
                    c.quadraticCurveTo(CX + FW * 0.6, CY - FH * 0.86, CX + FW * 0.74, CY - FH * 0.7);
                    c.bezierCurveTo(CX + FW * 0.84, CY - FH * 0.66, CX + FW * 0.92, CY - FH * 0.55, CX + FW * 0.9, CY - FH * 0.3);
                    c.stroke(); c.restore();
                }
            }

            // Ponytail: sleek, pulled back to the crown; the tail falls behind the right shoulder
            function sleekShape(c) {
                c.beginPath();
                c.moveTo(CX - FW * 1.0, CY - FH * 0.12);
                c.bezierCurveTo(CX - FW * 1.12, CY - FH * 0.85, CX - FW * 0.78, CY - FH * 1.27, CX, CY - FH * 1.28);
                c.bezierCurveTo(CX + FW * 0.78, CY - FH * 1.27, CX + FW * 1.12, CY - FH * 0.85, CX + FW * 1.0, CY - FH * 0.12);
                c.lineTo(CX + FW * 0.94, CY - FH * 0.12);
                c.bezierCurveTo(CX + FW * 0.94, CY - FH * 0.5, CX + FW * 0.75, CY - FH * 0.8, CX, CY - FH * 0.86);
                c.bezierCurveTo(CX - FW * 0.75, CY - FH * 0.8, CX - FW * 0.94, CY - FH * 0.5, CX - FW * 0.94, CY - FH * 0.12);
                c.closePath();
            }
            function sleek(c, L, gather, centrePart) {
                const base = L.hair, list = [];
                sleekShape(c); c.fillStyle = rgb(base); c.fill();
                c.save(); sleekShape(c); c.clip();
                hairDepth(c, base);
                for (let i = 0; i < 620; i++) {
                    const u = R(-1, 1), x0 = CX + u * FW * 0.98, y0 = CY - FH * (0.86 - (1 - Math.cos(u * 1.5)) * 0.62) + R(-3, 6);
                    if (centrePart) {   // from the centre parting down each side to the ears
                        const s = u < 0 ? -1 : 1;
                        list.push([CX + R(-3, 3), CY - FH * 1.28, CX + s * FW * 0.6, CY - FH * 1.25, CX + s * FW * 1.0, CY - FH * 0.9, CX + s * FW * R(0.95, 1.05), CY - FH * R(0.1, 0.4), R(1.1, 2.3)]);
                    } else {             // from the hairline up and back to where it's gathered
                        list.push([x0, y0, x0 + (gather[0] - x0) * 0.2, y0 - 50, gather[0] + (x0 - gather[0]) * 0.25, gather[1] + 40, gather[0] + R(-10, 10), gather[1] + R(-8, 8), R(1.1, 2.3)]);
                    }
                }
                strandSet(c, list, base, { x: CX + 10, y: CY - FH * 0.6, rx: FW * 1.0, ry: FH * 0.62, t: 22 });
                c.restore();
            }
            function ponytail(c, L, part) {
                const base = L.hair;
                if (part === 'front') return sleek(c, L, [CX + FW * 0.1, CY - FH * 1.3]);
                // the tail, swinging out from behind the head and down past the right shoulder
                const tail = () => {
                    c.beginPath(); c.moveTo(CX + FW * 0.5, CY - FH * 1.05);
                    c.bezierCurveTo(CX + FW * 1.2, CY - FH * 1.15, CX + FW * 1.38, CY - FH * 0.3, CX + FW * 1.24, CY + FH * 0.7);
                    c.quadraticCurveTo(CX + FW * 1.2, CY + FH * 1.1, CX + FW * 1.1, CY + FH * 1.3);
                    c.quadraticCurveTo(CX + FW * 1.02, CY + FH * 0.9, CX + FW * 1.0, CY + FH * 0.4);
                    c.bezierCurveTo(CX + FW * 1.04, CY - FH * 0.2, CX + FW * 0.95, CY - FH * 0.7, CX + FW * 0.4, CY - FH * 0.8);
                    c.closePath();
                };
                tail(); c.fillStyle = rgb(mul(base, 0.6)); c.fill();
                c.save(); tail(); c.clip();
                const list = [];
                for (let i = 0; i < 260; i++) {
                    const t = R(-1, 1);
                    list.push([CX + FW * 0.6, CY - FH * 1.0, CX + FW * (1.2 + t * 0.1), CY - FH * 0.95, CX + FW * (1.24 + t * 0.1), CY + FH * 0.1, CX + FW * (1.12 + t * 0.08), CY + FH * R(1.0, 1.4), R(1.2, 2.4)]);
                }
                strandSet(c, list, mul(base, 0.7), { x: CX + FW * 1.1, y: CY - FH * 0.2, rx: FW * 0.35, ry: FH * 0.8, t: 14, a0: 1.6, a1: 2.1 });
                const g = c.createLinearGradient(CX + FW * 1.05, 0, CX + FW * 1.45, 0); g.addColorStop(0, rgb(mul(base, 0.4), 0.6)); g.addColorStop(1, rgb(base, 0));
                c.fillStyle = g; c.fillRect(-500, -500, 2000, 2000);
                c.restore();
            }

            // Braids: a centre parting, two plaits from behind the ears down over the collarbones
            function plait(c, x0, y0, x1, y1, bend, base, width) {
                const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / (width * 0.42));
                const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2;
                const P = t => [(1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1];
                const dark = mul(base, 0.35), light = mix(base, [255, 240, 225], base[0] + base[1] + base[2] < 150 ? 0.3 : 0.4);
                c.strokeStyle = rgb(mul(base, 0.5)); c.lineCap = 'round';   // the plait's body under its crossings
                for (let i = 0; i < 8; i++) {
                    const t0 = i / 8, t1 = (i + 1) / 8, [ax, ay] = P(t0), [bx, by] = P(t1);
                    c.lineWidth = width * 0.9 * (1 - (t0 + t1) * 0.175); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
                }
                for (let i = 0; i < n; i++) {
                    const t = i / n, [x, y] = P(t), wd = width * (1 - t * 0.35), side = i % 2 ? 1 : -1;
                    const [nx, ny] = P(Math.min(1, t + 0.02)), ang = Math.atan2(ny - y, nx - x);
                    const ox = x + Math.cos(ang + Math.PI / 2) * side * wd * 0.17, oy = y + Math.sin(ang + Math.PI / 2) * side * wd * 0.17;
                    const rot = ang + Math.PI / 2 + side * 0.55;
                    c.fillStyle = rgb(dark, 0.6); c.beginPath(); c.ellipse(ox, oy + 2, wd * 0.62, wd * 0.3, rot, 0, TAU); c.fill();
                    c.fillStyle = rgb(base); c.beginPath(); c.ellipse(ox, oy, wd * 0.56, wd * 0.24, rot, 0, TAU); c.fill();
                    c.strokeStyle = rgb(light, 0.55); c.lineWidth = wd * 0.07; c.lineCap = 'round';
                    c.beginPath(); c.ellipse(ox, oy, wd * 0.42, wd * 0.18, rot, Math.PI * 1.1, Math.PI * 1.75); c.stroke();
                    c.strokeStyle = rgb(dark, 0.5); c.lineWidth = 0.8;
                    for (let k = -1; k <= 1; k++) { c.beginPath(); c.ellipse(ox, oy + k * wd * 0.08, wd * 0.45, wd * 0.2 + k * wd * 0.04, rot, Math.PI * 0.1, Math.PI * 0.9); c.stroke(); }
                }
                const [ex, ey] = P(1);   // the tied end
                c.strokeStyle = rgb(mul(base, 0.8), 0.7); c.lineWidth = 1.5;
                for (let i = 0; i < 14; i++) { c.beginPath(); c.moveTo(ex + R(-5, 5), ey); c.quadraticCurveTo(ex + R(-10, 10), ey + 20, ex + R(-14, 14), ey + R(28, 44)); c.stroke(); }
            }
            function braids(c, L, part) {
                if (part === 'back') return;
                sleek(c, L, null, true);
                for (const s of [-1, 1]) plait(c, CX + s * FW * 0.98, CY - FH * 0.2, CX + s * FW * 1.05, CY + FH * 1.85, s * FW * 0.22, L.hair, 56);
            }

            // Dreadlocks: locs from the crown, hanging behind and over the shoulders
            function loc(c, x0, y0, cx1, cy1, x1, y1, w, base) {
                const dark = mul(base, 0.35), light = mix(base, [255, 235, 210], base[0] + base[1] + base[2] < 150 ? 0.28 : 0.4);
                c.lineCap = 'round';
                const path = () => { c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx1, cy1, x1, y1); };
                c.strokeStyle = rgb(dark); c.lineWidth = w; path(); c.stroke();
                c.strokeStyle = rgb(base); c.lineWidth = w * 0.72; path(); c.stroke();
                c.save(); c.translate(-w * 0.16, -w * 0.05); c.strokeStyle = rgb(light, 0.45); c.lineWidth = w * 0.18; path(); c.stroke(); c.restore();
                const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / (w * 0.7));
                c.strokeStyle = rgb(dark, 0.45); c.lineWidth = Math.max(0.8, w * 0.08);
                for (let i = 1; i < n; i++) {
                    const t = i / n, x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx1 + t * t * x1, y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy1 + t * t * y1;
                    c.beginPath(); c.moveTo(x - w * 0.36, y - w * 0.1); c.quadraticCurveTo(x, y + w * 0.12, x + w * 0.36, y - w * 0.1); c.stroke();
                }
            }
            function dreadlocks(c, L, part) {
                const base = L.hair;
                if (part === 'back') {
                    for (let i = 0; i < 18; i++) {
                        const u = (i / 17) * 2 - 1, x0 = CX + u * FW * 1.0, y0 = CY - FH * (1.05 - Math.abs(u) * 0.55);
                        const x1 = CX + u * FW * 1.35 + R(-12, 12), y1 = CY + FH * R(1.4, 1.9);
                        loc(c, x0, y0, CX + u * FW * 1.45, CY + FH * 0.2, x1, y1, R(24, 30), mul(base, 0.8));
                    }
                    return;
                }
                const cap = () => {
                    c.beginPath();
                    c.moveTo(CX - FW * 1.02, CY - FH * 0.05);
                    c.bezierCurveTo(CX - FW * 1.14, CY - FH * 0.85, CX - FW * 0.8, CY - FH * 1.32, CX, CY - FH * 1.32);
                    c.bezierCurveTo(CX + FW * 0.8, CY - FH * 1.32, CX + FW * 1.14, CY - FH * 0.85, CX + FW * 1.02, CY - FH * 0.05);
                    c.lineTo(CX + FW * 0.93, CY - FH * 0.05);
                    c.bezierCurveTo(CX + FW * 0.93, CY - FH * 0.5, CX + FW * 0.7, CY - FH * 0.78, CX, CY - FH * 0.8);
                    c.bezierCurveTo(CX - FW * 0.7, CY - FH * 0.78, CX - FW * 0.93, CY - FH * 0.5, CX - FW * 0.93, CY - FH * 0.05);
                    c.closePath();
                };
                cap(); c.fillStyle = rgb(mul(base, 0.6)); c.fill();
                c.save(); cap(); c.clip();
                for (let i = 0; i < 22; i++) {   // locs from the crown, laid over the skull toward the hairline and sides
                    const th = Math.PI * (0.95 + i / 21 * 1.1);
                    const x1 = CX + Math.cos(th) * FW * 1.1, y1 = CY - FH * 0.35 + Math.sin(th) * FH * 0.7;
                    loc(c, CX + FW * 0.1 + R(-14, 14), CY - FH * 1.25, (CX + x1) / 2 + Math.cos(th) * 30, CY - FH * 1.15, x1, y1 + 30, 24, base);
                }
                hairDepth(c, base);
                sheenArc(c, base, { x: CX + 10, y: CY - FH * 0.6, rx: FW * 1.0, ry: FH * 0.62, t: 20 });
                c.restore();
                for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
                    const x0 = CX + s * FW * (0.92 + i * 0.12), y0 = CY - FH * (0.35 + i * 0.12);
                    loc(c, x0, y0, x0 + s * FW * 0.2, CY + FH * 0.6, x0 + s * FW * (0.1 + i * 0.05) + R(-8, 8), CY + FH * R(1.5, 1.9), R(25, 30), base);
                }
            }

            // Curls and afros: ringlets, each a column of loops with a shadowed underside and a lit crest
            function ringlet(c, x, y, len, r, ang, base, k) {
                const dark = mul(base, 0.3), light = mix(base, [255, 235, 210], 0.45), mid = mix(base, light, 0.35);
                const n = Math.max(2, Math.round(len / (r * 0.95))), dx = Math.cos(ang), dy = Math.sin(ang);
                c.lineCap = 'round';
                for (let i = 0; i < n; i++) {
                    const t = i / n, rr = r * (1 - t * 0.35), px = x + dx * t * len, py = y + dy * t * len, rot = ang - Math.PI / 2 + 0.45;
                    c.strokeStyle = rgb(dark, 0.9); c.lineWidth = rr * 0.8;
                    c.beginPath(); c.ellipse(px, py + rr * 0.15, rr, rr * 0.62, rot, 0, TAU); c.stroke();
                    c.strokeStyle = rgb(base); c.lineWidth = rr * 0.55;
                    c.beginPath(); c.ellipse(px, py, rr, rr * 0.62, rot, 0, TAU); c.stroke();
                    c.strokeStyle = rgb(mid, 0.9); c.lineWidth = rr * 0.32;
                    c.beginPath(); c.ellipse(px, py, rr, rr * 0.62, rot, Math.PI * 1.05, Math.PI * 1.85); c.stroke();
                    c.strokeStyle = rgb(light, 0.65 * k); c.lineWidth = rr * 0.12;
                    c.beginPath(); c.ellipse(px, py, rr, rr * 0.62, rot, Math.PI * 1.25, Math.PI * 1.65); c.stroke();
                }
            }
            function curlCloud(c, which) {
                c.beginPath();
                if (which === 'back') {
                    c.ellipse(CX, CY - FH * 0.25, FW * 1.5, FH * 1.12, 0, 0, TAU);
                    for (const s of [-1, 1]) { c.moveTo(CX + s * FW * 1.25 + FW * 0.5, CY + FH * 0.75); c.ellipse(CX + s * FW * 1.25, CY + FH * 0.75, FW * 0.5, FH * 0.55, 0, 0, TAU); }
                    return;
                }
                c.ellipse(CX, CY - FH * 0.92, FW * 1.3, FH * 0.55, 0, Math.PI, 0);
                c.lineTo(CX + FW * 1.04, CY - FH * 0.4);
                c.quadraticCurveTo(CX, CY - FH * 1.22, CX - FW * 1.04, CY - FH * 0.4); c.closePath();
            }
            function curls(c, L, part) {
                const base = L.hair;
                if (part === 'back') {
                    c.save(); c.filter = blurF(18); curlCloud(c, 'back'); c.fillStyle = rgb(mul(base, 0.45)); c.fill(); c.restore();
                    for (let i = 0; i < 150; i++) {
                        const a = R(0, TAU), rr = Math.sqrt(rnd());
                        let x = CX + Math.cos(a) * FW * 1.4 * rr, y = CY - FH * 0.3 + Math.sin(a) * FH * 1.0 * rr;
                        if (rnd() < 0.35) { const s = rnd() < 0.5 ? -1 : 1; x = CX + s * FW * R(1.0, 1.6); y = CY + FH * R(0.1, 1.0); }
                        ringlet(c, x, y - 20, R(50, 90), R(11, 15), Math.PI / 2 + R(-0.4, 0.4), mul(base, 0.9), 0.5);
                    }
                    return;
                }
                c.save(); c.filter = blurF(10); curlCloud(c, 'front'); c.fillStyle = rgb(mul(base, 0.45)); c.fill(); c.filter = 'none';
                for (let i = 0; i < 110; i++) {
                    const a = R(Math.PI * 1.05, Math.PI * 1.95), rr = Math.sqrt(R(0.1, 1));
                    const x = CX + Math.cos(a) * FW * 1.25 * rr, y = CY - FH * 0.62 + Math.sin(a) * FH * 0.9 * rr;
                    ringlet(c, x, y, R(40, 70), R(10, 14), Math.PI / 2 + (x - CX) / FW * 0.5 + R(-0.3, 0.3), base, 0.4 + 0.6 * Math.max(0, (x - CX + FW * 0.3) / FW));
                }
                c.restore();
                for (let i = 0; i < 16; i++) {   // ringlets falling past the temples, framing the face
                    const s = i % 2 ? 1 : -1;
                    ringlet(c, CX + s * FW * R(0.9, 1.2), CY - FH * R(0.75, 0.3), R(60, 110), R(10, 13), Math.PI / 2 + s * R(0.05, 0.3), base, s > 0 ? 0.9 : 0.45);
                }
            }
            // Afro: one soft mass, lit from the upper right, its surface a fine texture of coils and its edge fuzzy
            function afroCloud(c) {
                c.beginPath(); c.ellipse(CX, CY - FH * 0.4, FW * 1.78, FH * 1.3, 0, 0, TAU);
                for (let i = 0; i < 18; i++) {
                    const a = i / 18 * TAU + 0.2, br = FW * (0.32 + (i % 3) * 0.06);
                    const x = CX + Math.cos(a) * FW * 1.62, y = CY - FH * 0.4 + Math.sin(a) * FH * 1.17;
                    c.moveTo(x + br, y); c.arc(x, y, br, 0, TAU);
                }
            }
            const litAt = (x, y) => Math.max(0, Math.min(1, 0.45 + (x - CX) / FW * 0.22 - (y - CY + FH * 0.7) / FH * 0.35));
            /** Fine coils over whatever area `inside(x, y)` allows, sampled from the box x0..x1, y0..y1. */
            function coils(c, base, n, x0, x1, y0, y1, inside) {
                const dark = mul(base, 0.32), light = mix(base, [255, 236, 214], 0.3);
                c.lineCap = 'round';
                for (let i = 0; i < n; i++) {
                    const x = R(x0, x1), y = R(y0, y1);
                    if (!inside(x, y)) continue;
                    const lit = litAt(x, y), r = R(3, 6), a = R(0, TAU), dk = rnd() < 0.55 - lit * 0.25;
                    c.strokeStyle = dk ? rgb(dark, 0.55) : rgb(mix(base, light, lit), 0.25 + lit * 0.35);
                    c.lineWidth = R(1.6, 3);
                    c.beginPath(); c.arc(x, y, r, a, a + R(2.5, 4.5)); c.stroke();
                }
            }
            function afro(c, L, part) {
                const base = L.hair, cx0 = CX, cy0 = CY - FH * 0.4, rx = FW * 1.95, ry = FH * 1.45;
                if (part === 'back') {
                    c.save(); c.filter = blurF(6); afroCloud(c); c.fillStyle = rgb(base); c.fill(); c.restore();
                    let g = c.createRadialGradient(CX + FW * 0.55, CY - FH * 1.15, FW * 0.1, cx0, cy0, rx);
                    g.addColorStop(0, rgb(mix(base, [255, 236, 214], 0.12))); g.addColorStop(0.45, rgb(mul(base, 0.85))); g.addColorStop(1, rgb(mul(base, 0.32)));
                    atop(c, g);
                    const inCloud = (x, y) => ((x - cx0) / rx) ** 2 + ((y - cy0) / ry) ** 2 < 0.98;
                    coils(c, base, 7000, cx0 - rx, cx0 + rx, cy0 - ry, cy0 + ry, inCloud);
                    return;
                }
                const crown = () => {
                    c.beginPath();
                    c.ellipse(CX, CY - FH * 0.85, FW * 1.25, FH * 0.55, 0, Math.PI, 0);
                    c.lineTo(CX + FW * 1.0, CY - FH * 0.38);
                    c.quadraticCurveTo(CX, CY - FH * 1.3, CX - FW * 1.0, CY - FH * 0.38);
                    c.closePath();
                };
                crown(); c.fillStyle = rgb(base); c.fill();
                const g = c.createRadialGradient(CX + FW * 0.55, CY - FH * 1.15, FW * 0.1, cx0, cy0, rx);
                g.addColorStop(0, rgb(mix(base, [255, 236, 214], 0.12))); g.addColorStop(0.45, rgb(mul(base, 0.85))); g.addColorStop(1, rgb(mul(base, 0.32)));
                atop(c, g);
                c.save(); crown(); c.clip();
                coils(c, base, 2200, CX - FW * 1.3, CX + FW * 1.3, CY - FH * 1.45, CY - FH * 0.35, () => true);
                c.restore();
                // the hairline thins into the brow; the crown's top melts into the mass behind it
                c.save(); c.globalCompositeOperation = 'destination-out'; c.filter = blurF(6);
                c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 10;
                c.beginPath(); c.moveTo(CX + FW * 1.0, CY - FH * 0.38); c.quadraticCurveTo(CX, CY - FH * 1.3, CX - FW * 1.0, CY - FH * 0.38); c.stroke();
                c.strokeStyle = 'rgba(0,0,0,1)'; c.lineWidth = 30;
                c.beginPath(); c.ellipse(CX, CY - FH * 0.85, FW * 1.25, FH * 0.55, 0, Math.PI, 0); c.stroke();
                c.restore();
            }
            const STYLES = { long, demon_dancer, short, ponytail, braids, dreadlocks, curls, afro };

            // ════════════════ BODY ════════════════
            function body(c, L, rim) {
                const skin = L.skin, bw = L.bw, X = v => CX + v * bw;
                const lay = layer(1), b = lay.getContext('2d');
                b.fillStyle = rgb(mul(skin, 0.9));
                const nk = L.masc ? 84 : 72;
                b.beginPath(); b.moveTo(CX - nk, CY + FH * 0.7); b.bezierCurveTo(CX - nk - 2, CY + FH * 1.2, CX - nk - 10, CY + FH * 1.45, CX - nk - 38, CY + FH * 1.6);
                b.lineTo(CX + nk + 38, CY + FH * 1.6); b.bezierCurveTo(CX + nk + 10, CY + FH * 1.45, CX + nk + 2, CY + FH * 1.2, CX + nk, CY + FH * 0.7); b.closePath(); b.fill();
                b.beginPath(); b.moveTo(CX - 100, CY + FH * 1.52);
                b.bezierCurveTo(X(-240), CY + FH * 1.58, X(-380), CY + FH * 1.7, X(-430), CY + FH * 2.6);
                b.lineTo(X(430), CY + FH * 2.6);
                b.bezierCurveTo(X(380), CY + FH * 1.7, X(240), CY + FH * 1.58, CX + 100, CY + FH * 1.52);
                b.closePath(); b.fill();
                // the jaw's shadow on the neck, the neck's sides, the collarbones and the lit shoulder
                blob(b, CX, CY + FH * 1.02, 110, 70, mul(skin, 0.45), 0.85, 18, 0, 'source-atop');
                blob(b, CX - 60, CY + FH * 1.3, 30, 110, mul(skin, 0.6), 0.5, 20, 0.1, 'source-atop');
                blob(b, CX + 50, CY + FH * 1.3, 20, 100, mix(skin, [255, 240, 225], 0.3), 0.35, 20, -0.1, 'source-atop');
                for (const s of [-1, 1]) {
                    softLine(b, [CX + s * 40, CY + FH * 1.66, X(s * 110), CY + FH * 1.56, X(s * 200), CY + FH * 1.62], mul(skin, 0.55), 0.4, 7, 6, 'source-atop');
                    softLine(b, [CX + s * 40, CY + FH * 1.63, X(s * 110), CY + FH * 1.53, X(s * 200), CY + FH * 1.59], mix(skin, [255, 245, 235], 0.35), 0.35, 5, 5, 'source-atop');
                }
                blob(b, X(250), CY + FH * 1.85, 120, 60, mix(skin, [255, 245, 235], 0.35), 0.35, 30, 0, 'source-atop');
                // Clothes: wardrobe pieces draw their own front view, in pixels as they always have
                const WD = typeof WARDROBE !== 'undefined' ? WARDROBE : null, P = pixelP(bw);
                const piece = WD && L.top ? WD.tops[L.top.type] : null;
                const sh = `rgb(${Math.max(0, skin[0] - 35)}, ${Math.max(0, skin[1] - 30)}, ${Math.max(0, skin[2] - 25)})`;
                inPixels(b, () => {
                    if (piece) piece.portrait(b, P, L.top, sh);
                    else if (L.top) {
                        const { cx, cy, fw, fh } = P;
                        b.fillStyle = L.top.color || '#222';
                        b.beginPath(); b.moveTo(cx - fw * 0.35, cy + fh * 1.4);
                        b.quadraticCurveTo(cx - fw * 1.8 * bw, cy + fh * 1.6, cx - fw * 2.5 * bw, cy + fh * 2.8);
                        b.lineTo(cx + fw * 2.5 * bw, cy + fh * 2.8);
                        b.quadraticCurveTo(cx + fw * 1.8 * bw, cy + fh * 1.6, cx + fw * 0.35, cy + fh * 1.4); b.closePath(); b.fill();
                    }
                    for (const j of L.jewelry) if (WD.jewelry[j.type].at === 'neck') WD.jewelry[j.type].portrait(b, P, j);
                });
                // Everything on the body turns away from the light on the left and falls into shade below
                let g = b.createLinearGradient(CX - 420, 0, CX + 420, 0);
                g.addColorStop(0, 'rgba(10,4,10,0.5)'); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(0.68, 'rgba(255,248,240,0.06)'); g.addColorStop(1, 'rgba(10,4,10,0.4)');
                atop(b, g);
                g = b.createLinearGradient(0, CY + FH * 1.6, 0, 1000); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,4,10,0.7)');
                atop(b, g);
                if (L.top) blob(b, CX, CY + FH * 1.02, 110, 50, [10, 4, 10], 0.35, 22, 0, 'source-atop');   // the chin's shadow on a collar
                rimOn(lay, rim, 10, 0.85);
                put(c, lay);
            }
            function ears(c, L) {
                const skin = L.skin;
                for (const s of [-1, 1]) {
                    const x = CX + s * FW * 0.97, y = CY - FH * 0.02;
                    c.fillStyle = rgb(mul(skin, 0.85));
                    c.beginPath(); c.ellipse(x + s * 10, y, 22, 46, s * 0.15, 0, TAU); c.fill();
                    blob(c, x + s * 12, y, 10, 30, mul(skin, 0.55), 0.6, 4, s * 0.15);
                    blob(c, x + s * 14, y - 8, 6, 20, [200, 60, 60], 0.18, 6);
                }
            }

            // ════════════════ FACE ════════════════
            function shadeOf(skin) { return mix(mul(skin, 0.55), [120, 20, 40], 0.18); }
            function face(c, L, rim) {
                const skin = L.skin, shade = shadeOf(skin), k = 1 - lum(skin) * 0.25;   // pale skin takes softer shade
                const warm = mix(skin, [210, 70, 70], 0.35), lit = mix(skin, [255, 248, 240], 0.4);
                const lay = layer(2), f = lay.getContext('2d');
                facePath(f, 1, L.masc ? 1 : 0); f.fillStyle = rgb(skin); f.fill();
                f.save(); facePath(f, 1, L.masc ? 1 : 0); f.clip();
                // Planes: the side away from the key falls into shade; the brow, cheekbones and chin catch light
                blob(f, CX - FW * 1.05, CY, FW * 0.45, FH * 1.2, shade, 0.75 * k, 40);
                blob(f, CX + FW * 1.1, CY + FH * 0.1, FW * 0.22, FH * 1.0, shade, 0.55 * k, 22);           // the far edge turning away
                blob(f, CX + FW * 0.55, CY + FH * 0.95, FW * 0.5, FH * 0.16, shade, 0.4 * k, 20, -0.5);     // under the jaw
                blob(f, CX, CY - FH * 1.05, FW * 1.0, FH * 0.22, shade, 0.5 * k, 26);
                blob(f, CX, CY + FH * 1.05, FW * 0.7, FH * 0.15, shade, 0.4 * k, 24);
                for (const s of [-1, 1]) {
                    blob(f, CX + s * FW * 0.48, CY - FH * 0.16, FW * 0.3, FH * 0.14, shade, 0.4 * k, 18);                     // eye sockets
                    blob(f, CX + s * FW * 0.72, CY + FH * 0.4, FW * 0.18, FH * 0.24, shade, (s < 0 ? 0.4 : 0.22) * k, 26, s * -0.35);   // under the cheekbones
                    if (!L.masc) blob(f, CX + s * FW * 0.5, CY + FH * 0.16, FW * 0.26, FH * 0.15, warm, 0.22, 26);           // warmth in the cheeks
                    blob(f, CX + s * FW * 0.58, CY + FH * 0.02, FW * 0.26, FH * 0.08, lit, s > 0 ? 0.5 : 0.18, 18, s * 0.25);   // cheekbones
                    blob(f, CX + s * FW * 0.16, CY + FH * 0.5, FW * 0.12, FH * 0.12, shade, 0.25 * k, 12);                    // mouth corners
                }
                blob(f, CX + FW * 0.15, CY - FH * 0.62, FW * 0.45, FH * 0.17, lit, 0.45, 26);      // brow
                blob(f, CX, CY + FH * 0.82, FW * 0.2, FH * 0.08, lit, 0.4, 14);                     // chin
                blob(f, CX - FW * 0.42, CY + FH * 0.75, FW * 0.3, FH * 0.15, shade, 0.35 * k, 22, 0.5);   // jaw
                if (L.masc) {   // a shadow of stubble along the jaw and upper lip
                    blob(f, CX, CY + FH * 0.78, FW * 0.75, FH * 0.3, mul(skin, 0.6), 0.16, 24);
                    blob(f, CX, CY + FH * 0.4, FW * 0.3, FH * 0.06, mul(skin, 0.6), 0.12, 10);
                }
                if (!L.android) grain(f, skin, 0.12);
                else {          // plating: a sheen down the lit side
                    blob(f, CX + FW * 0.3, CY - FH * 0.3, FW * 0.4, FH * 0.6, [255, 255, 255], 0.25, 30);
                }
                f.restore();
                rimOn(lay, rim, 9, 0.9);
                put(c, lay);
            }
            function nose(c, L) {
                const skin = L.skin, shade = mix(mul(skin, 0.5), [110, 25, 40], 0.2), lit = mix(skin, [255, 250, 245], 0.5);
                const ny = CY + FH * 0.24, k = 1 - lum(skin) * 0.3;
                softLine(c, [CX - 18, CY - FH * 0.2, CX - 22, CY, CX - 26, ny - 20], shade, 0.45 * k, 12, 8);      // the bridge's shaded side
                softLine(c, [CX + 6, CY - FH * 0.25, CX + 6, CY - FH * 0.05, CX + 7, ny - 26], lit, 0.55, 8, 6);   // bridge highlight
                blob(c, CX, ny - 6, 24, 20, mix(skin, [220, 90, 90], 0.15), 0.35, 8);                              // the ball of the tip
                blob(c, CX + 5, ny - 12, 9, 7, lit, 0.7, 4);
                for (const s of [-1, 1]) {
                    softLine(c, [CX + s * 14, ny + 10, CX + s * 36, ny + 8, CX + s * 34, ny - 14], shade, (s < 0 ? 0.75 : 0.5) * k, 4, 2);   // the wings
                    blob(c, CX + s * 30, ny - 2, 10, 13, s < 0 ? shade : lit, s < 0 ? 0.35 : 0.25, 6);
                    blob(c, CX + s * 13, ny + 6, 6.5, 3, mul(skin, 0.3), 0.7, 1.2, s * 0.4);                              // nostrils
                }
                blob(c, CX - 4, ny + 20, 34, 7, shade, 0.5 * k, 6);                                                // shadow below
                softLine(c, [CX - 6, ny + 24, CX - 7, ny + 40, CX - 5, CY + FH * 0.42], shade, 0.25, 4, 3);         // philtrum
                softLine(c, [CX + 6, ny + 24, CX + 7, ny + 40, CX + 6, CY + FH * 0.42], lit, 0.3, 4, 3);
            }
            /** Fine lines with age (0..1): crow's feet, under the eyes, nose to mouth, the brow. */
            function age(c, L) {
                const k = Math.min(1, L.age), col = mul(L.skin, 0.5);
                for (const s of [-1, 1]) {
                    const ex = CX + s * 72, ey = CY - FH * 0.16;
                    for (let i = -1; i <= 1; i++) softLine(c, [ex + s * 46, ey + i * 7, ex + s * 56, ey + i * 10, ex + s * 66, ey + i * 14], col, 0.35 * k, 2, 1);
                    softLine(c, [ex - s * 20, ey + 26, ex, ey + 34, ex + s * 26, ey + 24], col, 0.3 * k, 2.5, 1.5);
                    softLine(c, [CX + s * 38, CY + FH * 0.24, CX + s * 54, CY + FH * 0.36, CX + s * 62, CY + FH * 0.52], col, 0.4 * k, 4, 3);
                }
                for (let i = 0; i < 2; i++) softLine(c, [CX - 60, CY - FH * (0.56 + i * 0.07), CX, CY - FH * (0.59 + i * 0.07), CX + 60, CY - FH * (0.56 + i * 0.07)], col, 0.25 * k, 2, 1.5);
            }

            // ── The living parts: eyes, brows and mouth, wearing the expression ──
            function eye(c, L, s, X, blink) {
                const skin = L.skin, iris = L.iris, shade = mix(mul(skin, 0.5), [90, 20, 40], 0.2), masc = L.masc;
                const ex = CX + s * 72, ey = CY - FH * 0.16, w = 40, h = 17;
                const inner = [ex - s * w, ey + 3], outer = [ex + s * w, ey - 4];
                const top = Math.min(1, Math.max(X.lids.top, blink)), low = X.lids.bottom;
                // the upper lid's edge comes down with the lids; the lower lifts for a smile
                const u1 = lerp(ey - h * 1.3, ey + h * 0.95, top), u2 = lerp(ey - h * 1.4, ey + h * 0.9, top);
                const l1 = Math.max(u1 + 1, ey + h * 1.15 - low * h * 1.3), l2 = Math.max(u2 + 1, ey + h * 1.1 - low * h * 1.3);
                const upper = () => c.bezierCurveTo(ex - s * w * 0.55, u1, ex + s * w * 0.45, u2, ...outer);
                // lid crease and the shadow under the brow ridge
                softLine(c, [ex - s * w * 0.8, ey - h * 0.8 + top * 6, ex + s * w * 0.05, ey - h * 2.7 + top * 14, ex + s * w * 1.05, ey - h * 1.0 + top * 6], shade, 0.7, 4, 2.5);
                blob(c, ex + s * 6, ey - h * 2.0, w * 0.9, h * 0.8, shade, 0.25, 10);
                const path = () => {
                    c.beginPath(); c.moveTo(...inner); upper();
                    c.bezierCurveTo(ex + s * w * 0.55, l2, ex - s * w * 0.45, l1, ...inner);
                    c.closePath();
                };
                if (top < 0.97) {
                    c.save(); path(); c.clip();
                    let g = c.createLinearGradient(0, ey - h * 1.3, 0, ey + h); g.addColorStop(0, '#9c8d8c'); g.addColorStop(0.5, '#e6ddd8'); g.addColorStop(1, '#f2ece8');
                    c.fillStyle = g; c.fillRect(ex - w - 5, ey - h * 2, w * 2 + 10, h * 4);
                    blob(c, inner[0] + s * 6, inner[1], 6, 5, [214, 120, 128], 0.85, 1.5);            // caruncle
                    blob(c, ex - s * w * 0.6, ey, 10, 8, [190, 140, 140], 0.25, 4);
                    // iris, following the gaze
                    const ix = ex + s * 2 + X.gaze.x * w * 0.35, iy = ey - 1 + X.gaze.y * h * 0.5, ir = h * 1.02;
                    g = c.createRadialGradient(ix, iy + ir * 0.35, ir * 0.1, ix, iy, ir);
                    g.addColorStop(0, rgb(mix(iris, [255, 245, 220], 0.45))); g.addColorStop(0.45, rgb(iris)); g.addColorStop(0.85, rgb(mul(iris, 0.55))); g.addColorStop(1, rgb(mul(iris, 0.25)));
                    c.fillStyle = g; c.beginPath(); c.arc(ix, iy, ir, 0, TAU); c.fill();
                    c.lineWidth = 0.9;
                    for (let i = 0; i < 70; i++) {
                        const a = rnd() * TAU, r0 = ir * R(0.35, 0.5), r1 = ir * R(0.7, 0.95);
                        c.strokeStyle = rgb(rnd() < 0.5 ? mix(iris, [255, 250, 230], 0.55) : mul(iris, 0.45), R(0.2, 0.5));
                        c.beginPath(); c.moveTo(ix + Math.cos(a) * r0, iy + Math.sin(a) * r0); c.lineTo(ix + Math.cos(a + R(-0.08, 0.08)) * r1, iy + Math.sin(a) * r1); c.stroke();
                    }
                    c.strokeStyle = 'rgba(10, 5, 8, 0.7)'; c.lineWidth = ir * 0.16; c.beginPath(); c.arc(ix, iy, ir * 0.93, 0, TAU); c.stroke();
                    c.fillStyle = '#060305'; c.beginPath(); c.arc(ix, iy, ir * 0.38, 0, TAU); c.fill();
                    // the upper lid's shadow across the eye
                    const lid = Math.min(u1, u2) - (ey - h * 1.4);
                    g = c.createLinearGradient(0, ey - h * 1.5 + lid, 0, ey - h * 0.1 + lid); g.addColorStop(0, 'rgba(25,8,15,0.75)'); g.addColorStop(1, 'rgba(25,8,15,0)');
                    c.fillStyle = g; c.fillRect(ex - w - 5, ey - h * 2, w * 2 + 10, h * 4);
                    // catchlights: the key light, a soft bounce, and the room's colour on the rim side
                    blob(c, ix + ir * 0.35, iy - ir * 0.38, ir * 0.22, ir * 0.18, [255, 255, 255], 0.95, 0.6);
                    blob(c, ix - ir * 0.4, iy + ir * 0.4, ir * 0.1, ir * 0.07, [255, 255, 255], 0.5, 0.6);
                    blob(c, ix - ir * 0.62, iy - ir * 0.1, ir * 0.09, ir * 0.14, L.rim, 0.8, 0.8);
                    c.restore();
                }
                // the lid itself where it has come down, and the lower lid where it has risen
                const lidSkin = mix(skin, shade, 0.25);
                if (top > 0) {
                    c.fillStyle = rgb(lidSkin);
                    c.beginPath(); c.moveTo(inner[0] - s * 2, inner[1]); c.bezierCurveTo(ex - s * w * 0.55, ey - h * 1.45, ex + s * w * 0.45, ey - h * 1.55, outer[0] + s * 2, outer[1]);
                    c.bezierCurveTo(ex + s * w * 0.45, u2, ex - s * w * 0.55, u1, inner[0] - s * 2, inner[1]); c.fill();
                }
                if (low > 0) {
                    c.fillStyle = rgb(mix(skin, [255, 245, 235], 0.08));
                    c.beginPath(); c.moveTo(inner[0] - s * 2, inner[1]); c.bezierCurveTo(ex - s * w * 0.45, ey + h * 1.2, ex + s * w * 0.55, ey + h * 1.15, outer[0] + s * 2, outer[1]);
                    c.bezierCurveTo(ex + s * w * 0.55, l2, ex - s * w * 0.45, l1, inner[0] - s * 2, inner[1]); c.fill();
                }
                // lid thickness, lash line, waterline
                c.strokeStyle = 'rgba(18, 8, 12, 0.95)'; c.lineWidth = masc ? 2.6 : 3.4; c.lineCap = 'round';
                c.beginPath(); c.moveTo(...inner); upper(); c.stroke();
                if (top < 0.6) softLine(c, [inner[0], inner[1] - 2, ex - s * w * 0.5, u1 - h * 0.45, ex + s * w * 0.45, u2 - h * 0.45, outer[0], outer[1] - 3], mix(skin, [255, 245, 235], 0.25), 0.5, 2.4, 1);
                c.strokeStyle = 'rgba(220, 150, 150, 0.55)'; c.lineWidth = 1.6;
                c.beginPath(); c.moveTo(inner[0] + s * 4, inner[1] + 1); c.bezierCurveTo(ex - s * w * 0.45, l1, ex + s * w * 0.55, l2 - 1, outer[0], outer[1] + 1); c.stroke();
                softLine(c, [inner[0] + s * 6, inner[1] + 4, ex - s * w * 0.4, l1 + h * 0.15, ex + s * w * 0.6, l2 + h * 0.1, outer[0], outer[1] + 2], shade, 0.55, 2, 1.2);
                // lashes: longest toward the outer corner; down along a closed lid
                const Bz = (t, a, b1, b2, d) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b1 + 3 * (1 - t) * t * t * b2 + t ** 3 * d;
                const down = top > 0.7 ? -0.6 : 1;
                c.strokeStyle = 'rgba(12, 6, 10, 0.92)';
                const nl = masc ? 12 : 17;
                for (let i = 0; i < nl; i++) {
                    const t = 0.12 + i / nl * 0.88;
                    const lx = Bz(t, inner[0], ex - s * w * 0.55, ex + s * w * 0.45, outer[0]), ly = Bz(t, inner[1], u1, u2, outer[1]);
                    const len = (masc ? 6 : 9) + t * t * (masc ? 6 : 16), out = s * (0.25 + t * 0.9);
                    c.lineWidth = (masc ? 1 : 1.3) * (1 - t * 0.2); c.globalAlpha = masc ? 0.6 : 0.85;
                    c.beginPath(); c.moveTo(lx, ly); c.quadraticCurveTo(lx + out * len * 0.15, ly - len * 0.8 * down, lx + out * len * 0.7, ly - len * 0.95 * down); c.stroke();
                }
                c.globalAlpha = 1;
                for (let i = 0; i < 9; i++) {
                    const t = 0.25 + i / 9 * 0.7;
                    const lx = Bz(t, inner[0], ex - s * w * 0.45, ex + s * w * 0.55, outer[0]), ly = Bz(t, inner[1], l1, l2, outer[1]) + 1;
                    c.lineWidth = 0.8; c.strokeStyle = 'rgba(20, 10, 14, 0.45)';
                    c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + s * t * 2, ly + 4 + t * 3); c.stroke();
                }
            }
            function brow(c, L, s, X) {
                const col = L.brow, x0 = CX + s * 22, x1 = CX + s * 120, y0 = CY - FH * 0.36;
                const thick = L.masc ? 1.45 : 1;
                const up = (X.brow.lift + (s > 0 ? X.brow.raise : 0)) * FH * 0.1;
                const yAt = t => y0 - Math.sin(Math.min(1, t / 0.7) * Math.PI * 0.5) * 16 * (1 + X.brow.arch) + Math.max(0, t - 0.7) * 30
                    - up - (1 - t) * X.brow.tilt * FH * 0.1 + t * X.brow.tilt * FH * 0.03;
                blob(c, (x0 + x1) / 2, (yAt(0.1) + yAt(0.9)) / 2 - 4, 52, 9 * thick, mul(col, 0.9), 0.35, 5);
                for (let i = 0; i < 140; i++) {
                    const t = rnd(), x = x0 + (x1 - x0) * t;
                    const y = yAt(t) + R(-6, 6) * (1 - t * 0.6) * thick;
                    const ang = t < 0.25 ? -Math.PI / 2 + s * 0.4 : (s > 0 ? -0.25 : Math.PI + 0.25) + (t > 0.7 ? s * 0.5 : 0);
                    const len = R(7, 12);
                    c.strokeStyle = rgb(rnd() < 0.3 ? mix(col, [255, 255, 255], 0.15) : mul(col, 0.7), R(0.5, 0.9)); c.lineWidth = R(0.8, 1.4) * (L.masc ? 1.2 : 1);
                    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.6); c.stroke();
                }
            }
            function mouth(c, L, X, talk) {
                const skin = L.skin, lipc = L.lips;
                const my = CY + FH * 0.5, mw = (L.masc ? 50 : 56) * (1 + X.mouth.width);
                // corners: a smile lifts both, a frown drops them, a smirk lifts one
                const lc = my + 2 - X.mouth.curve * FH * 0.1 + X.mouth.smirk * FH * 0.02;
                const rc = my + 1 - X.mouth.curve * FH * 0.1 - X.mouth.smirk * FH * 0.08;
                const o = Math.min(1, X.mouth.open + talk) * FH * 0.14;
                const mid = (cy, t) => my + (cy - my) * t;
                const upperEdge = () => {   // the upper lip's lower edge, right to left
                    c.bezierCurveTo(CX + mw * 0.5, mid(rc, 0.4) + 2, CX + 10, my + 1, CX, my + 3);
                    c.bezierCurveTo(CX - 10, my + 1, CX - mw * 0.5, mid(lc, 0.4) + 2, CX - mw, lc);
                };
                const up = () => {
                    c.beginPath(); c.moveTo(CX - mw, lc);
                    c.bezierCurveTo(CX - mw * 0.6, mid(lc, 0.6) - 7, CX - 18, my - 16, CX - 7, my - 13);
                    c.quadraticCurveTo(CX, my - 9, CX + 7, my - 13);
                    c.bezierCurveTo(CX + 18, my - 16, CX + mw * 0.6, mid(rc, 0.6) - 7, CX + mw, rc);
                    upperEdge(); c.closePath();
                };
                const low = () => {
                    c.beginPath(); c.moveTo(CX - mw + 3, lc + 1);
                    c.bezierCurveTo(CX - mw * 0.5, mid(lc, 0.4) + 4 + o, CX + mw * 0.5, mid(rc, 0.4) + 4 + o, CX + mw - 3, rc + 1);
                    c.bezierCurveTo(CX + mw * 0.6, mid(rc, 0.3) + 22 + o, CX + 16, my + 30 + o, CX, my + 30 + o);
                    c.bezierCurveTo(CX - 16, my + 30 + o, CX - mw * 0.6, mid(lc, 0.3) + 22 + o, CX - mw + 3, lc + 1);
                    c.closePath();
                };
                blob(c, CX, my + 40 + o, 34, 9, mix(mul(skin, 0.5), [110, 25, 40], 0.2), 0.45, 7);   // under the lower lip
                if (o > 1) {   // the mouth open: its dark, and the upper teeth
                    c.save();
                    c.beginPath(); c.moveTo(CX + mw, rc); upperEdge();
                    c.bezierCurveTo(CX - mw * 0.5, mid(lc, 0.4) + 4 + o, CX + mw * 0.5, mid(rc, 0.4) + 4 + o, CX + mw, rc); c.closePath();
                    c.fillStyle = '#2a0f16'; c.fill(); c.clip();
                    if (o > 6) { c.fillStyle = '#efe8e0'; c.beginPath(); c.ellipse(CX, my - 2, mw * 0.68, 6 + o * 0.25, 0, 0, TAU); c.fill(); blob(c, CX, my + 4 + o * 0.6, mw * 0.5, 4, [40, 10, 20], 0.5, 3); }
                    c.restore();
                }
                c.save(); up(); c.clip();
                let g = c.createLinearGradient(0, my - 16, 0, my + 3); g.addColorStop(0, rgb(mul(lipc, 0.85))); g.addColorStop(1, rgb(mul(lipc, 0.6)));
                c.fillStyle = g; c.fillRect(CX - mw - 5, my - 40, mw * 2 + 10, 60);
                blob(c, CX + 12, my - 9, 10, 2.5, [255, 240, 240], 0.35, 1.5);
                c.restore();
                c.save(); low(); c.clip();
                g = c.createLinearGradient(0, my + o, 0, my + 30 + o); g.addColorStop(0, rgb(mul(lipc, 0.75))); g.addColorStop(0.45, rgb(lipc)); g.addColorStop(1, rgb(mul(lipc, 0.8)));
                c.fillStyle = g; c.fillRect(CX - mw - 5, my - 30, mw * 2 + 10, 70 + o);
                c.strokeStyle = rgb(mul(lipc, 0.65), 0.35); c.lineWidth = 0.8;
                for (let i = 0; i < 18; i++) { const x = CX + R(-mw * 0.7, mw * 0.7); c.beginPath(); c.moveTo(x, my + 6 + o); c.lineTo(x + R(-2, 2), my + R(18, 26) + o); c.stroke(); }
                blob(c, CX + 10, my + 14 + o, 16, 5, [255, 245, 245], L.gloss, 2.5);
                blob(c, CX + 4, my + 15 + o, 5, 2, [255, 255, 255], L.gloss + 0.15, 0.8);
                c.restore();
                if (o <= 1) softLine(c, [CX - mw, lc, CX - 20, mid(lc, 0.3) + 6, CX + 20, mid(rc, 0.3) + 6, CX + mw, rc], [40, 8, 18], 0.85, 2.4, 0.8);   // where the lips meet
                blob(c, CX - mw - 2, lc, 4, 3, [40, 10, 20], 0.5, 2);
                blob(c, CX + mw + 2, rc, 4, 3, [40, 10, 20], 0.5, 2);
            }

            // ════════════════ PUTTING IT TOGETHER ════════════════
            /** Everything the painter needs from a portrait config. */
            function lookOf(config) {
                const A = androidLook(config.body);
                const me = APPEARANCES['949'];
                const hair = A ? (config.hair || null) : (config.hair === undefined ? me.hair : config.hair);
                const skin = hexA(A ? A.plate : (config.skinColor || me.skinColor), '#c68e63');
                const gender = config.gender || me.gender, masc = gender === 'male';
                const hairC = hair ? hexA(hair.color, '#1a1a1a') : null;
                const WD = typeof WARDROBE !== 'undefined' ? WARDROBE : null;
                const lips = mix(skin, masc ? [150, 72, 78] : [176, 60, 80], masc ? 0.3 : 0.45);
                return {
                    A, android: !!A, skin, masc, hair, hairC,
                    iris: hexA(config.eyeColor || me.eyeColor, '#6b4a2e'),
                    brow: hairC ? (Math.max(...hairC) - Math.min(...hairC) > 110 ? mix(hairC, [40, 28, 24], 0.6) : lum(hairC) > 0.6 ? mix(hairC, [90, 70, 50], 0.35) : hairC) : mul(skin, 0.4),
                    lips, gloss: masc ? 0.2 : 0.45,
                    top: config.top || null, hat: config.hat || null, age: A ? 0 : (config.age || 0),
                    jewelry: (config.jewelry || []).filter(j => WD && WD.jewelry[j.type]),
                    bw: typeof portraitBreadth === 'function' ? portraitBreadth(config) : 1,
                };
            }
            function setSpace(w, h) {
                W = w; H = h; S = Math.min(w, h) * ZOOM / 1000;
                OX = w / 2 - CX * S; OY = h * 0.5 - CY * S;
            }

            /** The still parts of a portrait: base (under the features) and front (over them). */
            function paintPlate(config, w, h, rimStr, key) {
                setSpace(w, h);
                const L = lookOf(config), rim = rimStr.split(',').map(Number);
                L.rim = rim;
                const style = L.hair && STYLES[L.hair.type];
                const Lh = { hair: L.hairC, masc: L.masc };
                const WD = typeof WARDROBE !== 'undefined' ? WARDROBE : null, P = pixelP(L.bw);
                seed = hash(key);
                const base = canvasFor(), b = base.getContext('2d');
                if (config.backdrop !== false) background(b, rim);
                if (style) {
                    const lay = layer(0); style(lay.getContext('2d'), Lh, 'back');
                    rimOn(lay, rim, 8, 0.55); put(b, lay);
                }
                body(b, L, rim);
                inPixels(b, () => { for (const j of L.jewelry) if (WD.jewelry[j.type].underHair) WD.jewelry[j.type].portrait(b, P, j); });
                if (!L.android) ears(b, L);
                face(b, L, rim);
                if (!L.android) { nose(b, L); if (L.age) age(b, L); }

                const front = canvasFor(), f = front.getContext('2d');
                inPixels(f, () => { for (const j of L.jewelry) if (WD.jewelry[j.type].at === 'face') WD.jewelry[j.type].portrait(f, P, j); });
                if (style) {
                    const lay = layer(3), x = lay.getContext('2d');
                    style(x, Lh, 'front');
                    rimOn(lay, rim, 7, 0.5);   // (before the cut, which would otherwise catch light on its own edge)
                    // Over the face the hair stops at the brow: cut away inside the face below an arch
                    x.save();
                    x.beginPath(); x.rect(-500, CY + FH * 0.2, 2000, 2000);
                    x.ellipse(CX, CY + FH * 0.2, FW * 0.95, FH * 0.6, 0, 0, TAU); x.clip('nonzero');
                    x.globalCompositeOperation = 'destination-out';
                    facePath(x, 0.94); x.fill();
                    x.restore();
                    put(f, lay);
                }
                inPixels(f, () => {
                    for (const j of L.jewelry) if (WD.jewelry[j.type].at === 'head' && !WD.jewelry[j.type].underHair) WD.jewelry[j.type].portrait(f, P, j);
                    for (const j of L.jewelry) if (WD.jewelry[j.type].portraitOver) WD.jewelry[j.type].portraitOver(f, P, j);
                });
                const hatPiece = WD && L.hat ? WD.hats[L.hat.type] : null;
                if (hatPiece) {   // the hat in its own layer, modelled and rimmed like everything else
                    const lay = layer(4), x = lay.getContext('2d');
                    inPixels(x, () => hatPiece.portrait(x, P, L.hat));
                    const g = x.createLinearGradient(CX - FW * 2, 0, CX + FW * 2, 0);
                    g.addColorStop(0, 'rgba(10,4,10,0.5)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(0.7, 'rgba(255,248,240,0.1)'); g.addColorStop(1, 'rgba(10,4,10,0.35)');
                    atop(x, g);
                    rimOn(lay, rim, 8, 0.7); put(f, lay);
                }
                return { base, front, L, w, h, seed: hash(key + '|f') };
            }

            // ════════════════ FULL FIGURE ════════════════
            // The whole of her, front on, for the dressing room (NEU.ME, ui/phone.js): the same head (hair, face, features,
            // hat, face and neck jewelry) on a painted body in the same light, dressed from her look (top, bottom, shoes,
            // legwear, bangles, what she's holding). Same 1000-unit space as the bust, carried on down to her feet
            // (8.5 heads: crown ~260, soles ~3790), so every brush works unchanged.
            const hx = (h, d) => hexA(/^#[0-9a-f]{3}$/i.test(h || '') ? '#' + h.slice(1).split('').map(k => k + k).join('') : h, d);

            /** A smooth limb round a centre line: [x, y, r] joints, rounded at both ends. */
            function limbPath(c, pts) {
                const n = pts.length, L = [], Rt = [];
                for (let i = 0; i < n; i++) {
                    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
                    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
                    L.push([pts[i][0] - dy * pts[i][2], pts[i][1] + dx * pts[i][2]]);
                    Rt.push([pts[i][0] + dy * pts[i][2], pts[i][1] - dx * pts[i][2]]);
                }
                const run = (side, first) => {
                    if (first) c.moveTo(side[0][0], side[0][1]); else c.lineTo(side[0][0], side[0][1]);
                    for (let i = 1; i < side.length; i++) {
                        const p0 = side[Math.max(0, i - 2)], p1 = side[i - 1], p2 = side[i], p3 = side[Math.min(side.length - 1, i + 1)];
                        c.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
                    }
                };
                c.beginPath();
                run(L, true);
                const e = pts[n - 1], s0 = pts[0];
                c.arc(e[0], e[1], e[2], Math.atan2(L[n - 1][1] - e[1], L[n - 1][0] - e[0]), Math.atan2(Rt[n - 1][1] - e[1], Rt[n - 1][0] - e[0]), true);
                run(Rt.slice().reverse(), false);
                c.arc(s0[0], s0[1], s0[2], Math.atan2(Rt[0][1] - s0[1], Rt[0][0] - s0[0]), Math.atan2(L[0][1] - s0[1], L[0][0] - s0[0]), true);
                c.closePath();
            }
            /** The part of a limb's centre line from t0 to t1 (by length), each radius grown by `grow`. */
            function limbPart(pts, t0, t1, grow = 0) {
                const segs = [], cum = [0];
                for (let i = 1; i < pts.length; i++) { segs.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); cum.push(cum[i - 1] + segs[i - 1]); }
                const total = cum[cum.length - 1];
                const at = t => {
                    const d = t * total; let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
                    const k = (d - cum[i - 1]) / (segs[i - 1] || 1), a = pts[i - 1], b = pts[i];
                    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k + grow];
                };
                const out = [at(t0)];
                for (let i = 1; i < pts.length - 1; i++) { const t = cum[i] / total; if (t > t0 && t < t1) out.push([pts[i][0], pts[i][1], pts[i][2] + grow]); }
                out.push(at(t1));
                return out;
            }

            /** Where everything on her is: the joints of a relaxed standing pose, the arm that holds something raised. */
            function figureRig(cfg) {
                const raised = cfg.held && cfg.held.type === 'glass';
                const rig = { arms: {}, legs: {}, hands: {} };
                for (const s of [-1, 1]) {
                    const up = raised && s === -1;                          // her right hand is on the viewer's left
                    rig.arms[s] = up
                        ? [[CX + s * 318, 905, 56], [CX + s * 372, 1150, 46], [CX + s * 388, 1370, 38], [CX + s * 330, 1240, 31], [CX + s * 272, 1110, 27]]
                        : [[CX + s * 318, 905, 56], [CX + s * 352, 1150, 46], [CX + s * 372, 1380, 38], [CX + s * 386, 1590, 33], [CX + s * 394, 1790, 27]];
                    rig.hands[s] = up ? { x: CX + s * 262, y: 1060, rot: s * 2.7 } : { x: CX + s * 398, y: 1880, rot: s * -0.06 };
                    const lean = s === 1 ? 14 : 0;                           // weight on her left leg: the right one eases in
                    rig.legs[s] = [[CX + s * 168, 1650, 148], [CX + s * 158, 2150, 118], [CX + s * (128 - lean), 2700, 62],
                                   [CX + s * (134 - lean), 3000, 70], [CX + s * (112 - lean * 1.3), 3540, 32]];
                }
                rig.feet = { [-1]: { x: CX - 112, y: 3540 }, [1]: { x: CX + 94, y: 3540 } };
                return rig;
            }
            function torsoPath(c) {
                c.beginPath();
                c.moveTo(CX - 62, 600);
                c.bezierCurveTo(CX - 64, 700, CX - 72, 770, CX - 120, 800);
                c.bezierCurveTo(CX - 210, 830, CX - 300, 840, CX - 340, 880);
                c.bezierCurveTo(CX - 372, 920, CX - 360, 990, CX - 300, 1010);
                c.bezierCurveTo(CX - 290, 1110, CX - 230, 1250, CX - 190, 1360);
                c.bezierCurveTo(CX - 210, 1450, CX - 300, 1530, CX - 312, 1650);
                c.bezierCurveTo(CX - 316, 1760, CX - 160, 1830, CX, 1850);
                c.bezierCurveTo(CX + 160, 1830, CX + 316, 1760, CX + 312, 1650);
                c.bezierCurveTo(CX + 300, 1530, CX + 210, 1450, CX + 190, 1360);
                c.bezierCurveTo(CX + 230, 1250, CX + 290, 1110, CX + 300, 1010);
                c.bezierCurveTo(CX + 360, 990, CX + 372, 920, CX + 340, 880);
                c.bezierCurveTo(CX + 300, 840, CX + 210, 830, CX + 120, 800);
                c.bezierCurveTo(CX + 72, 770, CX + 64, 700, CX + 62, 600);
                c.closePath();
            }
            function handPath(c, h) {
                c.save(); c.translate(h.x, h.y); c.rotate(h.rot);
                c.beginPath(); c.moveTo(-32, -95); c.bezierCurveTo(-50, -40, -46, 30, -26, 96); c.quadraticCurveTo(0, 118, 26, 96);
                c.bezierCurveTo(46, 30, 44, -40, 32, -95); c.closePath();
                c.moveTo(-34, -70); c.bezierCurveTo(-62, -40, -60, 10, -46, 30); c.lineTo(-30, 10); c.closePath();   // the thumb, turned in
                c.restore();
            }
            function footPath(c, f, s, heel) {
                c.beginPath();
                if (heel) {   // on her toes: the instep runs down, the toes come forward to a point
                    c.moveTo(f.x - 30, f.y - 20); c.bezierCurveTo(f.x - 40, f.y + 90, f.x - 44, f.y + 180, f.x - 18, f.y + 252);
                    c.quadraticCurveTo(f.x + s * 6, f.y + 270, f.x + 22, f.y + 248); c.bezierCurveTo(f.x + 40, f.y + 180, f.x + 40, f.y + 90, f.x + 32, f.y - 20);
                } else {
                    c.moveTo(f.x - 32, f.y - 20); c.bezierCurveTo(f.x - 44, f.y + 80, f.x - 64, f.y + 170, f.x - 54, f.y + 230);
                    c.quadraticCurveTo(f.x + s * 6, f.y + 262, f.x + 58, f.y + 228); c.bezierCurveTo(f.x + 62, f.y + 170, f.x + 44, f.y + 80, f.x + 34, f.y - 20);
                }
                c.closePath();
            }

            /** Model a filled layer: away from the light on the left, a sheen down the right, shade below; then the rim. */
            function modelLayer(lay, rim, k = 1, rimA = 0.75) {
                const x = lay.getContext('2d');
                let g = x.createLinearGradient(CX - 480, 0, CX + 480, 0);
                g.addColorStop(0, `rgba(10,4,10,${0.55 * k})`); g.addColorStop(0.42, 'rgba(0,0,0,0)'); g.addColorStop(0.66, `rgba(255,248,240,${0.07 * k})`); g.addColorStop(1, `rgba(10,4,10,${0.45 * k})`);
                atop(x, g);
                rimOn(lay, rim, 10, rimA);
            }
            /** A limb's own roundness: dark down its far edge, a soft highlight a little right of its centre. */
            function limbForm(x, pts, base, k = 1) {
                for (let i = 1; i < pts.length; i++) {
                    const a = pts[i - 1], b = pts[i], r = (a[2] + b[2]) / 2;
                    softLine(x, [a[0] - r * 0.7, a[1], (a[0] + b[0]) / 2 - r * 0.7, (a[1] + b[1]) / 2, b[0] - r * 0.7, b[1]], mul(base, 0.5), 0.45 * k, r * 0.6, r * 0.5, 'source-atop');
                    softLine(x, [a[0] + r * 0.25, a[1], (a[0] + b[0]) / 2 + r * 0.25, (a[1] + b[1]) / 2, b[0] + r * 0.25, b[1]], mix(base, [255, 248, 240], 0.45), 0.3 * k, r * 0.35, r * 0.4, 'source-atop');
                }
            }

            /** Paint the body and everything worn below the head into c. */
            function figureBody(c, L, rim, cfg, rig) {
                const skin = L.skin, top = cfg.top || null, bot = cfg.bottom || null, shoes = cfg.shoes || null;
                const legwear = (cfg.jewelry || []).filter(j => j.type === 'hose' || j.type === 'thigh_bands');
                const boots = shoes && shoes.type === 'thigh_heels';
                const heel = shoes && (shoes.type === 'heels' || boots);
                const longSkirt = bot && (bot.type === 'long_skirt' || (bot.type === 'skirt' && cfg.train));
                const skinLimb = (x, pts) => { limbPath(x, pts); x.fill(); };

                // Floor shadow
                blob(c, CX - 10, 3800, 300, 46, [0, 0, 0], 0.45, 26);

                // ── Skin: legs and feet, torso, arms, hands ──
                let lay = layer(1), x = lay.getContext('2d');
                x.fillStyle = rgb(mul(skin, 0.92));
                for (const s of [-1, 1]) {
                    skinLimb(x, rig.legs[s]);
                    footPath(x, rig.feet[s], s, heel); x.fill();
                }
                torsoPath(x); x.fill();
                for (const s of [-1, 1]) limbForm(x, rig.legs[s], skin);
                blob(x, CX, 1790, 70, 60, mul(skin, 0.45), 0.5, 26, 0, 'source-atop');              // between the thighs
                for (const s of [-1, 1]) blob(x, CX + s * 125, 2705, 34, 26, mul(skin, 0.6), 0.45, 12, 0, 'source-atop');   // the knees
                blob(x, CX, 760, 70, 60, mul(skin, 0.45), 0.7, 22, 0, 'source-atop');               // under the jaw
                for (const s of [-1, 1]) {
                    softLine(x, [CX + s * 40, 830, CX + s * 120, 812, CX + s * 230, 845], mul(skin, 0.55), 0.4, 9, 8, 'source-atop');    // collarbones
                    softLine(x, [CX + s * 40, 822, CX + s * 120, 804, CX + s * 230, 837], mix(skin, [255, 245, 235], 0.35), 0.35, 7, 7, 'source-atop');
                    blob(x, CX + s * 150, 1090, 115, 70, mul(skin, 0.6), 0.3, 30, 0, 'source-atop');  // the bust's underside
                }
                blob(x, CX + 10, 1260, 40, 120, mul(skin, 0.6), 0.25, 30, 0, 'source-atop');         // the line down the middle
                blob(x, CX, 1480, 18, 14, mul(skin, 0.45), 0.6, 6, 0, 'source-atop');                // navel
                modelLayer(lay, rim, 0.9);
                put(c, lay);

                // ── Legwear on the legs: stockings, tights and bands (under the skirt or trousers) ──
                for (const j of legwear) {
                    lay = layer(2); x = lay.getContext('2d');
                    const col = hx(j.color, '#101010');
                    for (const s of [-1, 1]) {
                        const t0 = j.type === 'thigh_bands' ? 0.27 : j.length === 'thigh' ? 0.24 : 0.0;
                        const t1 = j.type === 'thigh_bands' ? 0.31 : 1;
                        x.save(); limbPath(x, limbPart(rig.legs[s], t0, t1, 3)); x.clip();
                        if (t1 === 1 && !shoes) { footPath(x, rig.feet[s], s, heel); }
                        if (j.type === 'thigh_bands') { x.fillStyle = rgb(col); x.fillRect(CX - 600, 0, 1200, 4000); }
                        else hosePattern(x, j, col, skin, rig.legs[s], s);
                        x.restore();
                        if (t1 === 1) { x.save(); footPath(x, rig.feet[s], s, heel); x.clip(); hosePattern(x, j, col, skin, rig.legs[s], s); x.restore(); }
                        if (j.type === 'thigh_bands' || j.length === 'thigh' || j.cuff) {   // the welt (or the gold edge on the bands)
                            const w = limbPart(rig.legs[s], t0, t0 + 0.018, 4);
                            x.save(); limbPath(x, w); x.fillStyle = j.trim ? rgb(hx(j.trim)) : rgb(mul(col, 0.7)); x.fill(); x.restore();
                        }
                    }
                    for (const s of [-1, 1]) limbForm(x, rig.legs[s], col, 0.8);
                    modelLayer(lay, rim, 0.6, 0.5);
                    put(c, lay);
                }

                // ── Shoes ──
                if (shoes) {
                    lay = layer(2); x = lay.getContext('2d');
                    const col = hx(shoes.color, '#222');
                    x.fillStyle = rgb(col);
                    for (const s of [-1, 1]) {
                        const f = rig.feet[s];
                        if (boots) { limbPath(x, limbPart(rig.legs[s], 0.3, 1, 6)); x.fill(); }
                        if (shoes.type === 'sneakers') {
                            x.beginPath(); x.moveTo(f.x - 46, f.y - 40); x.bezierCurveTo(f.x - 62, f.y + 60, f.x - 82, f.y + 170, f.x - 70, f.y + 238);
                            x.quadraticCurveTo(f.x, f.y + 278, f.x + 74, f.y + 236); x.bezierCurveTo(f.x + 84, f.y + 170, f.x + 64, f.y + 60, f.x + 48, f.y - 40); x.closePath(); x.fill();
                        } else if (shoes.type === 'boots') {
                            x.beginPath(); x.moveTo(f.x - 52, f.y - 260); x.lineTo(f.x - 56, f.y + 60); x.bezierCurveTo(f.x - 74, f.y + 170, f.x - 70, f.y + 236, f.x - 60, f.y + 242);
                            x.quadraticCurveTo(f.x, f.y + 268, f.x + 62, f.y + 240); x.bezierCurveTo(f.x + 72, f.y + 170, f.x + 70, f.y + 60, f.x + 56, f.y - 260); x.closePath(); x.fill();
                        } else if (heel) {
                            footPath(x, f, s, true); x.save(); x.clip(); x.fillRect(f.x - 80, f.y + 70, 160, 260); x.restore();
                            x.beginPath(); x.moveTo(f.x - 34, f.y + 60); x.quadraticCurveTo(f.x, f.y + 40, f.x + 34, f.y + 60); x.lineTo(f.x + 38, f.y + 90); x.quadraticCurveTo(f.x, f.y + 70, f.x - 38, f.y + 90); x.closePath();
                            if (!boots) x.fill();                                                  // the ankle strap
                            if (boots) { footPath(x, f, s, true); x.fill(); }
                            x.fillRect(f.x + s * 26 - 5, f.y + 120, 10, 150);                        // the stiletto, glimpsed past the foot
                        } else {   // loafers, shoes
                            x.beginPath(); x.moveTo(f.x - 42, f.y + 40); x.bezierCurveTo(f.x - 64, f.y + 130, f.x - 72, f.y + 210, f.x - 58, f.y + 236);
                            x.quadraticCurveTo(f.x, f.y + 268, f.x + 60, f.y + 234); x.bezierCurveTo(f.x + 72, f.y + 210, f.x + 64, f.y + 130, f.x + 44, f.y + 40);
                            x.quadraticCurveTo(f.x, f.y + 66, f.x - 42, f.y + 40); x.closePath(); x.fill();
                        }
                    }
                    const dark = lum(col) < 0.25;
                    for (const s of [-1, 1]) {
                        const f = rig.feet[s];
                        if (shoes.type === 'sneakers') {   // the sole and laces
                            x.fillStyle = rgb(dark ? [235, 235, 240] : mul(col, 0.8));
                            x.beginPath(); x.ellipse(f.x + 2, f.y + 232, 76, 26, 0, 0, Math.PI); x.fill();
                            x.strokeStyle = rgb(mul(col, dark ? 2.5 : 0.6), 0.8); x.lineWidth = 6;
                            for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(f.x - 26, f.y + 30 + k * 32); x.lineTo(f.x + 26, f.y + 38 + k * 32); x.stroke(); }
                        }
                        if (shoes.type === 'loafers') { x.fillStyle = rgb(mul(col, 1.8 + 0.2)); x.fillRect(f.x - 26, f.y + 86, 52, 10); }
                        if (boots) limbForm(x, limbPart(rig.legs[s], 0.3, 1, 6), col, 1);
                    }
                    if (shoes.finish === 'sparkle') for (let k = 0; k < 140; k++) {
                        const s = rnd() < 0.5 ? -1 : 1, P0 = limbPart(rig.legs[s], R(0.3, 1), 1)[0];
                        blob(x, P0[0] + R(-P0[2], P0[2]) * 0.8, P0[1], R(2, 5), R(2, 5), [255, 255, 255], R(0.5, 1), 1, 0, 'source-atop');
                    }
                    const gloss = shoes.finish === 'velvet' ? 0.15 : boots || heel ? 0.7 : 0.35;
                    for (const s of [-1, 1]) {
                        const f = rig.feet[s];
                        if (boots) softLine(x, [f.x + s * 10 + 18, 2150, f.x + 30, 2700, f.x + 22, 3500], [255, 255, 255], gloss * 0.6, 14, 8, 'source-atop');
                        softLine(x, [f.x + 22, f.y + 40, f.x + 30, f.y + 140, f.x + 20, f.y + 220], [255, 255, 255], gloss * 0.6, 10, 7, 'source-atop');
                    }
                    if (shoes.finish === 'velvet') atop(x, rgb(mul(col, 0.5)), 0.15);
                    modelLayer(lay, rim, 0.7);
                    put(c, lay);
                }

                // ── Bottoms ──
                if (bot) {
                    lay = layer(2); x = lay.getContext('2d');
                    const col = hx(bot.color, '#222');
                    x.fillStyle = rgb(col);
                    const hips = (y1) => { x.save(); x.beginPath(); x.rect(CX - 600, 1350, 1200, y1 - 1350); x.clip(); torsoPath(x); x.fill(); x.lineWidth = 24; x.strokeStyle = rgb(col); x.stroke(); x.restore(); };
                    const legsIn = (grow, t1 = 0.985) => { for (const s of [-1, 1]) { limbPath(x, limbPart(rig.legs[s], 0, t1, grow)); x.fill(); } };
                    const T = bot.type;
                    if (T === 'pants' || T === 'joggers' || T === 'cargo' || T === 'leggings') {
                        hips(1900);
                        const grow = T === 'leggings' ? 4 : T === 'pants' ? 26 : 22;
                        if (T === 'pants') for (const s of [-1, 1]) { limbPath(x, rig.legs[s].map((p, i) => [p[0], p[1], Math.max(p[2], i < 2 ? 0 : 70) + 20])); x.fill(); }
                        else legsIn(grow, T === 'leggings' ? 0.985 : 0.97);
                        x.save(); x.globalCompositeOperation = 'source-atop';
                        for (const s of [-1, 1]) {   // the fold down the middle of each leg, the seam at the crotch
                            softLine(x, [CX + s * 150, 1900, CX + s * 140, 2700, CX + s * 125, 3500], mul(col, 0.6), 0.35, 10, 10);
                            if (T === 'joggers' && bot.trim) softLine(x, [CX + s * 300, 1640, CX + s * 250, 2600, CX + s * 175, 3500], hx(bot.trim), 0.9, 14, 1);
                            if (T === 'cargo') { x.fillStyle = rgb(mul(col, 0.8)); x.fillRect(CX + s * 250 - 70, 2200, 140, 190); x.fillStyle = rgb(mul(col, 1.3)); x.fillRect(CX + s * 250 - 70, 2200, 140, 30); }
                        }
                        x.restore();
                        if (T === 'joggers') { x.save(); x.globalCompositeOperation = 'source-atop'; x.fillStyle = rgb(mul(col, 0.72)); x.fillRect(CX - 400, 3400, 800, 90); x.restore(); }   // the cuffs
                        x.fillStyle = rgb(mul(col, 0.75)); x.fillRect(CX - 200, 1345, 400, 40);    // the waistband
                    } else if (T === 'ball_gown' || T === 'mermaid' || T === 'slit_gown' || T === 'slip_skirt') {
                        gownSkirt(x, T, col, bot, rig);
                    } else {
                        // Skirts: a waist, then a shape out to the hem
                        const hem = T === 'pencil_skirt' ? 2760 : T === 'pleated_skirt' ? 2250 : longSkirt ? 3720 : 2420;
                        const flare = T === 'pencil_skirt' ? 230 : T === 'pleated_skirt' ? 470 : longSkirt ? (cfg.train ? 560 : 440) : 400;
                        x.beginPath();
                        x.moveTo(CX - 190, 1350);
                        x.bezierCurveTo(CX - 250, 1450, CX - 330, 1560, CX - 325, 1700);
                        x.bezierCurveTo(CX - 320, 2000, CX - flare, hem - 300, CX - flare, hem);
                        if (T === 'pleated_skirt') for (let k = 0; k <= 16; k++) x.lineTo(CX - flare + (2 * flare) * k / 16, hem + (k % 2 ? 26 : 0));
                        else x.quadraticCurveTo(CX, hem + 60, CX + flare, hem);
                        x.bezierCurveTo(CX + flare, hem - 300, CX + 320, 2000, CX + 325, 1700);
                        x.bezierCurveTo(CX + 330, 1560, CX + 250, 1450, CX + 190, 1350);
                        x.closePath(); x.fill();
                        if (cfg.train) {   // the train, sweeping out behind her to her left
                            x.beginPath(); x.moveTo(CX + 120, 2400); x.bezierCurveTo(CX + 520, 2900, CX + 640, 3500, CX + 700, 3800);
                            x.quadraticCurveTo(CX + 300, 3880, CX - 60, 3780); x.closePath(); x.fillStyle = rgb(hx(cfg.train.color || bot.color)); x.fill();
                        }
                        x.save(); x.globalCompositeOperation = 'source-atop';
                        if (T === 'pleated_skirt') {
                            const stripe = bot.stripe ? hx(bot.stripe) : null;
                            for (let k = 0; k < 16; k++) {
                                const xt = CX - 170 + 340 * (k + 0.5) / 16, xb = CX - flare + 2 * flare * (k + 0.5) / 16;
                                if (stripe && k % 2) { x.fillStyle = rgb(stripe); x.beginPath(); x.moveTo(xt - 10, 1380); x.lineTo(xt + 10, 1380); x.lineTo(xb + 26, hem + 30); x.lineTo(xb - 26, hem + 30); x.closePath(); x.fill(); }
                                softLine(x, [xt, 1400, (xt + xb) / 2, (1400 + hem) / 2, xb, hem], mul(col, 0.45), 0.5, 8, 4);
                            }
                            if (bot.trim) { x.strokeStyle = rgb(hx(bot.trim)); x.lineWidth = 22; x.beginPath(); for (let k = 0; k <= 16; k++) x.lineTo(CX - flare + 2 * flare * k / 16, hem - 6 + (k % 2 ? 26 : 0)); x.stroke(); }
                        } else {
                            for (const k of [-0.55, -0.15, 0.3, 0.7]) softLine(x, [CX + k * 160, 1550, CX + k * flare * 0.9, (1550 + hem) / 2, CX + k * flare, hem], mul(col, 0.55), 0.35, 26, 20);
                            for (const k of [-0.35, 0.1, 0.5]) softLine(x, [CX + k * 160, 1550, CX + k * flare * 0.9, (1550 + hem) / 2, CX + k * flare, hem], mix(col, [255, 250, 245], 0.4), 0.22, 16, 16);
                            if (T === 'pencil_skirt') softLine(x, [CX + 90, hem - 220, CX + 92, hem - 100, CX + 94, hem + 10], mul(col, 0.3), 0.8, 8, 2);   // the slit
                        }
                        x.restore();
                    }
                    fabricOn(x, bot, col, 1350, T === 'ball_gown' || T === 'mermaid' || T === 'slit_gown' ? 3780 : 3000);
                    if (lum(col) > 0.85) atop(x, 'rgba(120,110,150,1)', 0.12);   // white cloth still takes the room's shade
                    modelLayer(lay, rim, 0.85);
                    put(c, lay);
                }

                // ── The arms (under the top's sleeves), hands, bangles ──
                lay = layer(1); x = lay.getContext('2d');
                x.fillStyle = rgb(mul(skin, 0.92));
                for (const s of [-1, 1]) { limbPath(x, rig.arms[s]); x.fill(); handPath(x, rig.hands[s]); x.fill(); }
                for (const s of [-1, 1]) limbForm(x, rig.arms[s], skin);
                for (const s of [-1, 1]) {   // fingers: a few lines down the hand
                    const h = rig.hands[s]; x.save(); x.translate(h.x, h.y); x.rotate(h.rot);
                    for (const k of [-14, 0, 14]) softLine(x, [k, 10, k * 1.1, 50, k * 1.2, 92], mul(skin, 0.6), 0.5, 4, 2, 'source-atop');
                    x.restore();
                }
                modelLayer(lay, rim, 0.9);
                put(c, lay);

                // ── The top ──
                if (top) {
                    lay = layer(2); x = lay.getContext('2d');
                    const col = hx(top.color, '#222'), T = top.type;
                    x.fillStyle = rgb(col);
                    const band = (y0, y1, grow = 10) => { x.save(); x.beginPath(); x.rect(CX - 600, y0, 1200, y1 - y0); x.clip(); torsoPath(x); x.fill(); x.lineWidth = grow * 2; x.strokeStyle = rgb(col); x.stroke(); x.restore(); };
                    const sleeves = (t1, grow = 10) => { for (const s of [-1, 1]) { limbPath(x, limbPart(rig.arms[s], 0, t1, grow)); x.fill(); } };
                    if (T === 'corset' || T === 'halter' || T === 'off_shoulder' || T === 'slip') {
                        bodice(x, T, col, top, rig);
                    } else if (T === 'sports_bra' || T === 'crop_top' || T === 'sleeved_crop' || T === 'tank') {
                        const y1 = T === 'sports_bra' ? 1150 : 1210;
                        x.save(); x.beginPath(); x.rect(CX - 600, 950, 1200, y1 - 950); x.clip(); torsoPath(x); x.fill(); x.restore();
                        x.beginPath(); x.moveTo(CX - 290, 960); x.quadraticCurveTo(CX - 150, 900, CX, 1000); x.quadraticCurveTo(CX + 150, 900, CX + 290, 960);
                        x.lineTo(CX + 290, 1000); x.lineTo(CX - 290, 1000); x.closePath(); x.fill();          // the neckline's curve
                        if (T === 'crop_top') { x.beginPath(); x.moveTo(CX - 330, 900); x.quadraticCurveTo(CX, 960, CX + 330, 900); x.lineTo(CX + 300, 1000); x.lineTo(CX - 300, 1000); x.closePath(); x.fill(); sleeves(0.12, 14); }
                        if (T === 'sleeved_crop') { x.beginPath(); x.moveTo(CX - 330, 880); x.quadraticCurveTo(CX, 950, CX + 330, 880); x.lineTo(CX + 300, 1000); x.lineTo(CX - 300, 1000); x.closePath(); x.fill(); sleeves(0.97, 8); }
                        if (T === 'sports_bra' || T === 'tank') for (const s of [-1, 1]) { x.lineWidth = 22; x.strokeStyle = rgb(col); x.beginPath(); x.moveTo(CX + s * 200, 960); x.quadraticCurveTo(CX + s * 175, 860, CX + s * 170, 818); x.stroke(); }
                        x.save(); x.globalCompositeOperation = 'source-atop';
                        softLine(x, [CX, 990, CX + 2, 1040, CX, 1100], mul(col, 0.55), 0.45, 10, 8);       // between the cups
                        for (const s of [-1, 1]) blob(x, CX + s * 140, 1010, 70, 40, mix(col, [255, 250, 245], 0.4), 0.3, 24);
                        if (T === 'sports_bra') { x.fillStyle = rgb(mul(col, 0.7)); x.fillRect(CX - 300, y1 - 40, 600, 40); }
                        x.restore();
                    } else {
                        const y1 = T === 'tshirt' ? 1420 : T === 'track_jacket' ? 1660 : T === 'coat' ? 1700 : 1500;
                        band(780, y1, 12);
                        if (T === 'coat') {   // the coat's skirts to the knee, open over what's under it
                            x.beginPath(); x.moveTo(CX - 300, 1500); x.bezierCurveTo(CX - 360, 1900, CX - 380, 2400, CX - 400, 2780); x.lineTo(CX - 60, 2780);
                            x.lineTo(CX - 40, 1500); x.closePath(); x.fill();
                            x.beginPath(); x.moveTo(CX + 300, 1500); x.bezierCurveTo(CX + 360, 1900, CX + 380, 2400, CX + 400, 2780); x.lineTo(CX + 60, 2780);
                            x.lineTo(CX + 40, 1500); x.closePath(); x.fill();
                        }
                        sleeves(T === 'tshirt' ? 0.26 : 0.95, T === 'coat' ? 18 : 12);
                        x.save(); x.globalCompositeOperation = 'source-atop';
                        if (T === 'coat') {
                            x.fillStyle = rgb(hx(top.inner, '#111'));
                            x.beginPath(); x.moveTo(CX - 110, 800); x.lineTo(CX - 60, 2780); x.lineTo(CX + 60, 2780); x.lineTo(CX + 110, 800); x.closePath(); x.fill();
                            for (const s of [-1, 1]) {   // lapels
                                x.fillStyle = rgb(mul(col, 1.25)); x.beginPath(); x.moveTo(CX + s * 110, 800); x.lineTo(CX + s * 230, 900); x.lineTo(CX + s * 140, 1080); x.lineTo(CX + s * 70, 1300); x.closePath(); x.fill();
                            }
                        }
                        if (T === 'track_jacket') {
                            softLine(x, [CX, 820, CX + 4, 1200, CX, 1660], [20, 16, 24], 0.7, 8, 1);   // the zip
                            if (top.trim) for (const s of [-1, 1]) {
                                const a = rig.arms[s]; softLine(x, [a[0][0] + s * 50, a[0][1], a[2][0] + s * 40, a[2][1], a[4][0] + s * 28, a[4][1] - 30], hx(top.trim), 0.9, 12, 1);
                            }
                            x.fillStyle = rgb(mul(col, 0.8)); x.fillRect(CX - 330, 1600, 660, 60);
                        }
                        if (T === 'tshirt') {   // tucked: soft folds gathering at the waist
                            for (const k of [-1, 1]) softLine(x, [CX + k * 60, 1150, CX + k * 90, 1300, CX + k * 120, 1420], mul(col, 0.65), 0.4, 18, 14);
                            x.fillStyle = rgb(mul(col, 0.92)); x.beginPath(); x.moveTo(CX - 80, 790); x.lineTo(CX, 900); x.lineTo(CX + 80, 790); x.closePath(); x.fill();   // the open collar
                            for (const s of [-1, 1]) { x.fillStyle = rgb(mix(col, [255, 255, 255], 0.3)); x.beginPath(); x.moveTo(CX + s * 20, 790); x.lineTo(CX + s * 140, 790); x.lineTo(CX + s * 70, 880); x.closePath(); x.fill(); }
                        }
                        for (const s of [-1, 1]) blob(x, CX + s * 150, 1120, 90, 60, mul(col, 0.65), 0.4, 30);    // under the bust
                        x.restore();
                    }
                    fabricOn(x, top, col, 760, 1480);
                    if (lum(col) > 0.85) atop(x, 'rgba(120,110,150,1)', 0.12);
                    modelLayer(lay, rim, 0.85);
                    put(c, lay);
                }

                // ── Bangles at both wrists ──
                const bangles = (cfg.jewelry || []).find(j => j.type === 'bangles');
                if (bangles) {
                    const col = hx(bangles.color, '#e8c27a');
                    for (const s of [-1, 1]) {
                        const w = rig.arms[s][4];
                        for (let k = 0; k < 3; k++) {
                            c.strokeStyle = rgb(mul(col, k === 1 ? 1.15 : 0.9)); c.lineWidth = 9;
                            c.beginPath(); c.ellipse(w[0], w[1] - 20 - k * 22, 38, 12, 0, 0, Math.PI); c.stroke();
                        }
                    }
                }
            }

            /** The evening bodices, each to the waist over bare shoulders: corset (sweetheart, boned, a pointed
             *  basque), halter (to the nape, a keyhole), off the shoulder (a band across the arms), slip (a V on straps). */
            function bodice(x, T, col, top, rig) {
                x.save(); torsoPath(x); x.clip();
                x.beginPath();
                if (T === 'corset') {
                    x.moveTo(CX - 420, 1010); x.lineTo(CX - 300, 1000);
                    x.quadraticCurveTo(CX - 150, 905, CX - 6, 1015); x.quadraticCurveTo(CX + 150, 905, CX + 300, 1000); x.lineTo(CX + 420, 1010);
                    x.lineTo(CX + 420, 1395); x.lineTo(CX + 140, 1410); x.lineTo(CX, 1480); x.lineTo(CX - 140, 1410); x.lineTo(CX - 420, 1395);
                } else if (T === 'halter') {
                    x.moveTo(CX - 64, 760); x.lineTo(CX + 64, 760); x.lineTo(CX + 285, 1010); x.lineTo(CX + 420, 1400); x.lineTo(CX - 420, 1400); x.lineTo(CX - 285, 1010);
                } else if (T === 'off_shoulder') {
                    x.moveTo(CX - 420, 905); x.quadraticCurveTo(CX, 990, CX + 420, 905); x.lineTo(CX + 420, 1400); x.lineTo(CX - 420, 1400);
                } else {
                    x.moveTo(CX - 420, 985); x.lineTo(CX - 260, 980); x.quadraticCurveTo(CX - 110, 1000, CX, 1130); x.quadraticCurveTo(CX + 110, 1000, CX + 260, 980);
                    x.lineTo(CX + 420, 985); x.lineTo(CX + 420, 1400); x.lineTo(CX - 420, 1400);
                }
                x.closePath(); x.fill();
                x.restore();
                if (T === 'halter') {   // the keyhole, and the band at her nape
                    x.save(); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.ellipse(CX, 950, 34, 72, 0, 0, TAU); x.fill(); x.restore();
                    x.fillStyle = rgb(mul(col, 0.8)); x.beginPath(); x.roundRect(CX - 66, 742, 132, 40, 12); x.fill();
                }
                if (T === 'off_shoulder') {   // the band wraps her upper arms
                    for (const s of [-1, 1]) { limbPath(x, limbPart(rig.arms[s], 0.09, 0.2, 9)); x.fill(); }
                    softLine(x, [CX - 400, 925, CX, 1005, CX + 400, 925], mix(col, [255, 250, 245], 0.4), 0.45, 14, 6);
                }
                if (T === 'slip') for (const s of [-1, 1]) softLine(x, [CX + s * 175, 990, CX + s * 172, 900, CX + s * 168, 812], col, 1, 7, 0.5);
                x.save(); x.globalCompositeOperation = 'source-atop';
                for (const s of [-1, 1]) blob(x, CX + s * 140, 1030, 80, 46, mix(col, [255, 250, 245], 0.35), 0.28, 24);   // the light on the bust
                if (T === 'corset') {
                    for (const k of [-230, -150, -70, 70, 150, 230]) softLine(x, [CX + k, 1090, CX + k * 0.92, 1250, CX + k * 0.85, 1405], mul(col, 0.55), 0.5, 6, 3);   // the boning
                    if (top.trim) {
                        x.strokeStyle = rgb(hx(top.trim)); x.lineWidth = 9; x.beginPath();
                        x.moveTo(CX - 300, 1000); x.quadraticCurveTo(CX - 150, 905, CX - 6, 1015); x.quadraticCurveTo(CX + 150, 905, CX + 300, 1000); x.stroke();
                        x.lineWidth = 4; x.beginPath();   // lacing down the front
                        for (let y = 1060; y < 1400; y += 46) { x.moveTo(CX - 26, y); x.lineTo(CX + 26, y + 40); x.moveTo(CX + 26, y); x.lineTo(CX - 26, y + 40); }
                        x.stroke();
                    }
                }
                x.restore();
            }

            /** A smooth curve on through points (already at the first), tangent-continuous at each. */
            function through(c, P) {
                for (let i = 1; i < P.length; i++) {
                    const p0 = P[Math.max(0, i - 2)], p1 = P[i - 1], p2 = P[i], p3 = P[Math.min(P.length - 1, i + 1)];
                    c.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
                }
            }
            /** Gowns and the slip's skirt: ball gown (a bell over petticoats, tulle over it), mermaid (close to the knee,
             *  flaring to the floor), slit gown (floor length, open to the thigh on her left), slip skirt (bias-cut to mid-calf). */
            function gownSkirt(x, T, col, bot, rig) {
                const acc = bot.accent ? hx(bot.accent) : null;
                const side = (s, pts) => pts.map(([px, py]) => [CX + s * px, py]);
                let L;   // the right-hand outline from the waist down to the hem's edge, as [x, y] from the centre line
                if (T === 'ball_gown') L = [[190, 1350], [300, 1500], [400, 1800], [520, 2600], [640, 3760]];
                else if (T === 'mermaid') L = [[190, 1350], [290, 1500], [326, 1680], [290, 2150], [205, 2750], [260, 3220], [430, 3790]];
                else if (T === 'slit_gown') L = [[190, 1350], [290, 1500], [326, 1690], [335, 2300], [380, 3000], [420, 3750]];
                else L = [[190, 1350], [290, 1500], [326, 1690], [322, 2300], [340, 2960]];
                x.save(); x.beginPath(); x.rect(CX - 600, 1350, 1200, 600); x.clip(); torsoPath(x); x.fill(); x.lineWidth = 16; x.strokeStyle = rgb(col); x.stroke(); x.restore();   // over her hips first
                const hem = L[L.length - 1][1];
                const path = () => {
                    x.beginPath();
                    const left = side(-1, L), right = side(1, L).reverse();
                    x.moveTo(left[0][0], left[0][1]); through(x, left);
                    const n = T === 'ball_gown' ? 9 : 7, w = L[L.length - 1][0];   // a softly waved hem
                    for (let k = 1; k <= n; k++) { const xa = CX - w + (2 * w) * (k - 0.5) / n, xb = CX - w + (2 * w) * k / n; x.quadraticCurveTo(xa, hem + (T === 'slip_skirt' ? 34 * (k / n) : 38), xb, hem + (T === 'slip_skirt' ? 26 * (k / n) : 0)); }
                    x.lineTo(right[0][0], right[0][1]); through(x, right);
                    x.closePath();
                };
                path(); x.fill();
                x.save(); x.globalCompositeOperation = 'source-atop';
                if (acc) {   // ombré to the hem
                    const g = x.createLinearGradient(0, 1700, 0, hem); g.addColorStop(0, rgb(col, 0)); g.addColorStop(1, rgb(acc, 0.95));
                    x.fillStyle = g; x.fillRect(CX - 800, 1350, 1600, hem - 1300);
                }
                const folds = T === 'ball_gown' ? [-0.8, -0.55, -0.3, -0.05, 0.2, 0.45, 0.7] : [-0.6, -0.25, 0.15, 0.5];
                const fy = T === 'mermaid' ? 2900 : 1700, w = L[L.length - 1][0];
                for (const k of folds) softLine(x, [CX + k * 200, fy, CX + k * w * 0.75, (fy + hem) / 2, CX + k * w, hem], mul(col, 0.5), 0.4, T === 'ball_gown' ? 34 : 24, 20);
                for (const k of folds) softLine(x, [CX + (k + 0.12) * 200, fy, CX + (k + 0.12) * w * 0.75, (fy + hem) / 2, CX + (k + 0.12) * w, hem], mix(col, [255, 250, 245], 0.45), 0.24, 16, 14);
                if (T === 'mermaid') softLine(x, [CX - 210, 2760, CX, 2800, CX + 210, 2760], mul(col, 0.5), 0.5, 10, 6);   // where the flare is set in
                if (T === 'slip_skirt') softLine(x, [CX + 120, 1500, CX + 180, 2200, CX + 120, 2900], [255, 250, 245], 0.35, 30, 22);   // the bias's long sheen
                x.restore();
                if (T === 'ball_gown') {   // tulle: a sheer second skirt, a shade lighter, a little wider at the hem
                    x.save(); x.globalAlpha = 0.28; x.fillStyle = rgb(mix(acc || col, [255, 255, 255], 0.35));
                    x.beginPath(); x.moveTo(CX - 190, 1350); x.bezierCurveTo(CX - 330, 1500, CX - 520, 2400, CX - 690, 3770);
                    for (let k = 1; k <= 12; k++) x.quadraticCurveTo(CX - 690 + 1380 * (k - 0.5) / 12, 3800, CX - 690 + 1380 * k / 12, 3770 - (k % 2) * 20);
                    x.bezierCurveTo(CX + 520, 2400, CX + 330, 1500, CX + 190, 1350); x.closePath(); x.fill(); x.restore();
                }
                if (T === 'slit_gown') {   // open from the thigh on her left (the viewer's right), the leg showing through
                    x.save(); x.globalCompositeOperation = 'destination-out';
                    x.beginPath(); x.moveTo(CX + 175, 2150); x.quadraticCurveTo(CX + 210, 3000, CX + 330, 3800); x.lineTo(CX + 30, 3800); x.quadraticCurveTo(CX + 120, 3000, CX + 175, 2150); x.fill();
                    x.restore();
                    softLine(x, [CX + 175, 2150, CX + 125, 3000, CX + 40, 3790], mul(col, 0.45), 0.8, 12, 5);
                }
            }

            /** The cloth itself: sequins (a scatter of glints), satin (long soft sheens), velvet (deep and soft-edged). */
            function fabricOn(x, piece, col, y0, y1) {
                const f = piece.fabric;
                if (!f) return;
                x.save(); x.globalCompositeOperation = 'source-atop';
                if (f === 'sequin') {
                    const acc = piece.accent ? hx(piece.accent) : null;
                    for (let k = 0; k < 900; k++) {
                        const px = R(CX - 720, CX + 720), py = R(y0, y1), t = rnd();
                        x.fillStyle = t < 0.12 ? 'rgba(255,255,255,0.95)' : t < 0.5 ? rgb(mix(col, [255, 255, 255], 0.55), 0.8) : rgb(mul(acc && rnd() < 0.5 ? acc : col, 0.55), 0.7);
                        x.fillRect(px, py, t < 0.12 ? 7 : 5, t < 0.12 ? 7 : 5);
                    }
                    for (let k = 0; k < 26; k++) {   // a few stars of light
                        const px = R(CX - 400, CX + 450), py = R(y0, y1), r = R(10, 22);
                        x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath();
                        x.moveTo(px - r, py); x.lineTo(px, py - 2.5); x.lineTo(px + r, py); x.lineTo(px, py + 2.5); x.closePath();
                        x.moveTo(px, py - r); x.lineTo(px + 2.5, py); x.lineTo(px, py + r); x.lineTo(px - 2.5, py); x.closePath(); x.fill();
                    }
                } else if (f === 'satin') {
                    for (const k of [0.15, 0.45]) softLine(x, [CX + k * 300, y0, CX + k * 380, (y0 + y1) / 2, CX + k * 300, y1], [255, 252, 245], 0.32, 46, 30);
                } else if (f === 'velvet') {
                    const g = x.createLinearGradient(CX - 500, 0, CX + 500, 0);
                    g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(0.3, 'rgba(0,0,0,0.05)'); g.addColorStop(0.62, 'rgba(255,220,230,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
                    x.fillStyle = g; x.fillRect(CX - 800, y0 - 100, 1600, y1 - y0 + 200);
                }
                x.restore();
            }

            /** Stockings and tights: the pattern over the sheer base, inside the current clip. */
            function hosePattern(x, j, col, skin, leg, s) {
                const st = j.style || 'plain', acc = j.accent ? hx(j.accent, '#a3122e') : null;
                const sheer = st === 'pointelle' ? 0.94 : st === 'net_stripe' || st === 'heart_net' ? 0.25 : 0.62;
                x.fillStyle = rgb(col, sheer); x.fillRect(CX - 700, 0, 1400, 4200);
                const top = leg[0][1], bot = 3900, xl = leg[0][0] - 220, xr = leg[0][0] + 220;
                x.save();
                if (st === 'stripe' || st === 'net_stripe') {
                    for (let px = xl; px < xr; px += 44) { x.fillStyle = rgb(col, 0.95); x.fillRect(px, top, 18, bot - top); }
                }
                if (st === 'net_stripe' || st === 'heart_net') {   // fishnet
                    x.strokeStyle = rgb(col, 0.85); x.lineWidth = 3.5;
                    x.beginPath();
                    for (let k = -60; k < 120; k++) { x.moveTo(xl, top + k * 34); x.lineTo(xr, top + k * 34 + 440); x.moveTo(xr, top + k * 34); x.lineTo(xl, top + k * 34 + 440); }
                    x.stroke();
                }
                if (st === 'heart_net' || st === 'heart_lace') {
                    const hc = st === 'heart_lace' ? (acc || [232, 206, 206]) : col;
                    for (let yy = top + 40, r = 0; yy < bot; yy += 120, r++) for (let px = xl + (r % 2) * 55; px < xr; px += 110) heart(x, px, yy, st === 'heart_lace' ? 22 : 15, hc, st === 'heart_lace');
                }
                if (st === 'argyle') {
                    const a1 = acc || [163, 18, 46], a2 = j.accent2 ? hx(j.accent2) : [74, 51, 40];
                    for (let yy = top, r = 0; yy < bot; yy += 150, r++) for (let px = xl + (r % 2) * 60; px < xr; px += 120) {
                        x.fillStyle = rgb(r % 2 ? a1 : a2, 0.85);
                        x.beginPath(); x.moveTo(px, yy); x.lineTo(px + 60, yy + 75); x.lineTo(px, yy + 150); x.lineTo(px - 60, yy + 75); x.closePath(); x.fill();
                    }
                    x.strokeStyle = rgb(a1, 0.7); x.lineWidth = 3;
                    x.beginPath(); for (let k = -40; k < 60; k++) { x.moveTo(xl, top + k * 150); x.lineTo(xr, top + k * 150 + 550); x.moveTo(xr, top + k * 150); x.lineTo(xl, top + k * 150 + 550); } x.stroke();
                }
                if (st === 'pointelle') {
                    for (let px = xl; px < xr; px += 46) for (let yy = top; yy < bot; yy += 34) { x.fillStyle = rgb(mix(col, skin, 0.6), 0.9); x.beginPath(); x.ellipse(px, yy, 6, 9, 0, 0, TAU); x.fill(); }
                }
                if (st === 'deco') {
                    const gold = [232, 194, 122];
                    for (let px = xl; px < xr; px += 70) for (let yy = top; yy < bot; yy += 30) { x.fillStyle = rgb(gold, 0.55); x.beginPath(); x.arc(px, yy, 4, 0, TAU); x.fill(); }
                    x.strokeStyle = rgb(gold, 0.7); x.lineWidth = 10;
                    x.beginPath(); x.moveTo(xl, top + 300); x.lineTo(xr, top + 900); x.stroke();
                    for (let yy = top + 700; yy < bot; yy += 800) { x.lineWidth = 4; x.beginPath(); x.arc(leg[0][0] + s * 20, yy, 40, 0, TAU); x.arc(leg[0][0] + s * 20, yy, 22, 0, TAU); x.stroke(); }
                }
                x.restore();
            }
            function heart(x, px, py, r, col, outline) {
                x.beginPath(); x.moveTo(px, py + r * 0.9);
                x.bezierCurveTo(px - r * 1.4, py, px - r * 0.9, py - r * 1.1, px, py - r * 0.35);
                x.bezierCurveTo(px + r * 0.9, py - r * 1.1, px + r * 1.4, py, px, py + r * 0.9); x.closePath();
                if (outline) { x.strokeStyle = rgb(col, 0.9); x.lineWidth = 3.5; x.stroke(); } else { x.fillStyle = rgb(col, 0.95); x.fill(); }
            }

            /** What she's holding, over her hand. */
            function figureHeld(c, held, rig) {
                if (!held) return;
                if (held.type === 'glass') {
                    const D = (typeof GLASS_DRINKS !== 'undefined' && GLASS_DRINKS[held.drink]) || { liquid: '#f2d57e', glass: 'flute' };
                    const h = rig.hands[-1], gx = h.x + 6, gy = h.y - 40, liq = hx(D.liquid, '#f2d57e');
                    const flute = D.glass === 'flute' || D.glass === 'soda';
                    const bw = flute ? 30 : D.glass === 'martini' || D.glass === 'coupe' ? 70 : D.glass === 'tumbler' || D.glass === 'mug' ? 48 : 52;
                    const bh = flute ? 170 : D.glass === 'martini' || D.glass === 'coupe' ? 80 : D.glass === 'tumbler' || D.glass === 'mug' ? 110 : 130;
                    const stem = D.glass === 'tumbler' || D.glass === 'mug' || D.glass === 'soda' ? 0 : 90;
                    const yb = gy + 20;                                      // where the bowl meets the stem, just above her fingers
                    c.save();
                    c.fillStyle = 'rgba(230,236,255,0.18)'; c.strokeStyle = 'rgba(240,244,255,0.75)'; c.lineWidth = 4;
                    c.beginPath();
                    if (D.glass === 'martini') { c.moveTo(gx - bw, yb - bh); c.lineTo(gx + bw, yb - bh); c.lineTo(gx, yb); c.closePath(); }
                    else { c.moveTo(gx - bw, yb - bh); c.bezierCurveTo(gx - bw, yb - bh * 0.3, gx - bw * 0.6, yb, gx, yb); c.bezierCurveTo(gx + bw * 0.6, yb, gx + bw, yb - bh * 0.3, gx + bw, yb - bh); c.closePath(); }
                    c.fill();
                    c.save(); c.clip(); c.fillStyle = rgb(liq, 0.85); c.fillRect(gx - bw - 4, yb - bh * 0.72, bw * 2 + 8, bh);
                    if (D.liquid2) { c.fillStyle = rgb(hx(D.liquid2), 0.7); c.fillRect(gx - bw - 4, yb - bh * 0.3, bw * 2 + 8, bh); }
                    if (D.bubbles) for (let k = 0; k < 10; k++) { c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.arc(gx + R(-bw * 0.5, bw * 0.5), yb - R(10, bh * 0.7), R(2, 4), 0, TAU); c.fill(); }
                    c.restore(); c.stroke();
                    if (stem) { c.beginPath(); c.moveTo(gx, yb); c.lineTo(gx, yb + stem); c.stroke(); c.beginPath(); c.ellipse(gx, yb + stem, 34, 8, 0, 0, TAU); c.stroke(); }
                    softLine(c, [gx + bw * 0.5, yb - bh * 0.9, gx + bw * 0.62, yb - bh * 0.6, gx + bw * 0.45, yb - bh * 0.25], [255, 255, 255], 0.7, 6, 2);
                    c.restore();
                    // her fingers round the stem, over the glass
                    c.fillStyle = rgb(mul(rig.skin, 0.9)); c.beginPath(); c.ellipse(gx - 4, yb + (stem ? 50 : -bh * 0.35), 30, 24, 0, 0, TAU); c.fill();
                } else if (held.type === 'umbrella') {   // closed, its tip on the ground like a cane
                    const h = rig.hands[1], col = hx(held.color, '#b9a8e6'), trim = hx(held.trim, '#e8c27a');
                    c.save();
                    c.strokeStyle = rgb(trim); c.lineWidth = 12; c.beginPath(); c.arc(h.x - 30, h.y - 40, 34, Math.PI, 0); c.stroke();   // the crook
                    c.fillStyle = rgb(col); c.beginPath(); c.moveTo(h.x + 4, h.y - 10); c.lineTo(h.x + 40, h.y + 180); c.quadraticCurveTo(h.x + 60, h.y + 900, h.x + 70, h.y + 1500);
                    c.lineTo(h.x + 50, h.y + 1500); c.quadraticCurveTo(h.x + 10, h.y + 900, h.x - 30, h.y + 180); c.closePath(); c.fill();
                    softLine(c, [h.x + 20, h.y + 200, h.x + 48, h.y + 900, h.x + 60, h.y + 1480], mul(col, 0.6), 0.6, 14, 6);
                    c.strokeStyle = rgb(trim); c.lineWidth = 8; c.beginPath(); c.moveTo(h.x + 60, h.y + 1500); c.lineTo(h.x + 62, h.y + 1690); c.stroke();
                    c.restore();
                    c.fillStyle = rgb(mul(rig.skin, 0.9)); c.beginPath(); c.ellipse(h.x - 2, h.y - 6, 40, 30, 0, 0, TAU); c.fill();   // her hand over the handle
                }
            }

            /** The full figure into ctx (w × h, transparent ground). Cached per look and size. */
            const figCache = new Map();
            function figure(ctx, w, h, config) {
                w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
                const rim = config.rim || [196, 150, 255];
                const key = 'fig|' + w + 'x' + h + '|' + rim + '|' + stable(config);
                let out = figCache.get(key);
                if (!out) {
                    W = w; H = h; S = Math.min(h / 3820, w / 1400); OX = w / 2 - CX * S; OY = (h - 3820 * S) / 2 - 40 * S;
                    const L = lookOf(config); L.rim = rim;
                    const rig = figureRig(config); rig.skin = L.skin;
                    const style = L.hair && STYLES[L.hair.type], Lh = { hair: L.hairC, masc: L.masc };
                    const WD = typeof WARDROBE !== 'undefined' ? WARDROBE : null, P = pixelP(L.bw);
                    seed = hash(key);
                    out = canvasFor(); const b = out.getContext('2d');
                    if (style) { const lay = layer(0); style(lay.getContext('2d'), Lh, 'back'); rimOn(lay, rim, 8, 0.55); put(b, lay); }
                    figureBody(b, L, rim, config, rig);
                    inPixels(b, () => { for (const j of L.jewelry) if (WD.jewelry[j.type].at === 'neck') WD.jewelry[j.type].portrait(b, P, j); });
                    inPixels(b, () => { for (const j of L.jewelry) if (WD.jewelry[j.type].underHair) WD.jewelry[j.type].portrait(b, P, j); });
                    if (!L.android) ears(b, L);
                    face(b, L, rim);
                    if (!L.android) nose(b, L);
                    const X = resolveExpression(config.expression || 'neutral');
                    if (!L.android) { for (const s of [-1, 1]) { eye(b, L, s, X, 0); brow(b, L, s, X); } mouth(b, L, X, 0); }
                    inPixels(b, () => { for (const j of L.jewelry) if (WD.jewelry[j.type].at === 'face') WD.jewelry[j.type].portrait(b, P, j); });
                    if (style) {
                        const lay = layer(3), x = lay.getContext('2d');
                        style(x, Lh, 'front'); rimOn(lay, rim, 7, 0.5);
                        x.save(); x.beginPath(); x.rect(-500, CY + FH * 0.2, 2000, 5000);
                        x.ellipse(CX, CY + FH * 0.2, FW * 0.95, FH * 0.6, 0, 0, TAU); x.clip('nonzero');
                        x.globalCompositeOperation = 'destination-out'; facePath(x, 0.94); x.fill(); x.restore();
                        put(b, lay);
                    }
                    inPixels(b, () => {
                        for (const j of L.jewelry) if (WD.jewelry[j.type].at === 'head' && !WD.jewelry[j.type].underHair) WD.jewelry[j.type].portrait(b, P, j);
                        for (const j of L.jewelry) if (WD.jewelry[j.type].portraitOver) WD.jewelry[j.type].portraitOver(b, P, j);
                    });
                    const hatPiece = WD && L.hat ? WD.hats[L.hat.type] : null;
                    if (hatPiece) { const lay = layer(4), x = lay.getContext('2d'); inPixels(x, () => hatPiece.portrait(x, P, L.hat)); rimOn(lay, rim, 8, 0.7); put(b, lay); }
                    figureHeld(b, config.held, rig);
                    figCache.set(key, out);
                    if (figCache.size > 12) figCache.delete(figCache.keys().next().value);
                }
                ctx.drawImage(out, 0, 0, w, h);
            }

            const cache = new Map();
            let frame = null;
            const stable = v => v === null || typeof v !== 'object' ? JSON.stringify(v)
                : Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
                : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';

            function draw(ctx, w, h, config) {
                w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
                const rim = portraitRimRGB(config);
                const still = { ...config }; delete still.expression; delete still.blink; delete still.talk; delete still.isFallback;
                const key = w + 'x' + h + '|' + rim + '|' + stable(still);
                let plate = cache.get(key);
                if (plate) { cache.delete(key); cache.set(key, plate); }
                else {
                    plate = paintPlate(config, w, h, rim, key);
                    cache.set(key, plate);
                    if (cache.size > 40) cache.delete(cache.keys().next().value);
                }
                setSpace(w, h);
                if (!frame) frame = document.createElement('canvas');
                if (frame.width !== w || frame.height !== h) { frame.width = w; frame.height = h; }
                const c = frame.getContext('2d');
                c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
                c.clearRect(0, 0, w, h);
                c.drawImage(plate.base, 0, 0);
                c.setTransform(S, 0, 0, S, OX, OY);
                const L = plate.L, X = resolveExpression(config.expression), blink = config.blink || 0, talk = config.talk || 0;
                seed = plate.seed;
                if (L.android) {
                    inPixels(c, () => drawAndroidPortraitFace(c, pixelP(L.bw), L.A, X, blink, talk));
                } else {
                    if (X.blush > 0) for (const s of [-1, 1]) blob(c, CX + s * FW * 0.5, CY + FH * 0.2, FW * 0.3, FH * 0.14, [214, 72, 104], 0.28 * X.blush, 20);
                    for (const s of [-1, 1]) { eye(c, L, s, X, blink); brow(c, L, s, X); }
                    mouth(c, L, X, talk);
                }
                c.setTransform(1, 0, 0, 1, 0, 0);
                c.drawImage(plate.front, 0, 0);
                ctx.drawImage(frame, 0, 0, w, h);
            }

            return { draw, figure, supported, clear: () => { cache.clear(); figCache.clear(); } };
        })();

        /** A character's bust: the painted portrait, or the classic one where canvas filters aren't available. */
        function drawCharacterPortrait(ctx, w, h, config) {
            if (!config.classic && RealPortrait.supported()) return RealPortrait.draw(ctx, w, h, config);
            return drawCharacterPortraitClassic(ctx, w, h, config);
        }
