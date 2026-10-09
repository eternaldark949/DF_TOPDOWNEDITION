        /* =====================================================================
           BODIES — builds, height, the body's shape, and Double Nights androids
           ---------------------------------------------------------------------
           config.build   'slim' | 'athletic' | 'curvy' | 'broad' | 'heavy'
                          (none = the classic shape for the character's gender)
           config.height  0.9 … 1.1 (1 = classic)
           config.body    { kind: 'android', finish: 'silver' | 'gold' | 'bloodmoon',
                            glow: '#hex' (visor colour), hover: true, emblem: false }
           Builds scale the body (breadth y, depth x) and keep the head's shape;
           height scales everything. Both are visual only — collision is unchanged.
           The shape itself (BODY_CANON below): tapered limbs joined at round
           joints, hands and feet, a torso with deltoid caps, the pelvis, the head.

           Double Nights' AI staff are finished in the ethereal silver of the moon,
           the soft gold of sunlight on the moon, or — a select few — Blood Moon
           rose red. Their mark is two overlapping crescent moons.
           ===================================================================== */
        const BUILDS = {
            //         breadth  depth   head   hips (extra, curvy)  shoulders (extra)
            slim:     { w: 0.88, d: 0.92, head: 0.98 },
            athletic: { w: 1.05, d: 1.02, head: 1.0, shoulder: 1.08 },
            curvy:    { w: 1.04, d: 1.04, head: 1.0, hip: 1.25 },
            broad:    { w: 1.15, d: 1.08, head: 1.02, shoulder: 1.1 },
            heavy:    { w: 1.2,  d: 1.22, head: 1.05, hip: 1.1 },
        };

        /** Scale for a character's body frame, or null for the classic shape. */
        function bodyScale(config) {
            const b = BUILDS[config.build], h = config.height || 1;
            if (!b && h === 1) return null;
            const B = b || { w: 1, d: 1, head: 1 };
            return { x: h * B.d, y: h * B.w, k: h * B.head };
        }

        /* ── The body's shape ──────────────────────────────────────────────────
           Proportions per gender, adjusted by the build (bodyCanon). The head
           stays big (16 across): that's the style. Torso and pelvis numbers are
           in their own frames: origin at the hip anchor (3px behind the head's
           centre), +x facing, y shoulder to shoulder.
             sh, del      shoulder joints at ±sh; the deltoid cap's radius
             tf, tb       chest front and upper back; chest, back: half-breadths there
             bust         { x, y, r } (female)
             hf, hb, hw   pelvis front, back, half-breadth at the hip bones; cleft: the seat's
             leg          where each thigh hangs from the pelvis (±leg)
             thigh, calf, upper, fore   limb tapers [near r, belly r, belly at 0..1, far r]
             hand, foot   hand and foot size (1 = female)
           Every limb segment ends in a circle the size of its joint and the next
           starts with the same circle, so knees and elbows stay joined. The
           deltoids are caps drawn over the torso's edge: seen from above, the
           shoulders are the highest thing after the head.
           ───────────────────────────────────────────────────────────────────── */
        const BODY_CANON = {
            female:      { sh: 10.5, del: 4.0, tf: 6.0, tb: -7.2, chest: 7.8, back: 8.8, bust: { x: 5.4, y: 4.9, r: 3.3 },
                           hf: 3.0, hb: -9.0, hw: 12.0, cleft: 0.8, leg: 5.4,
                           thigh: [4.7, 4.5, 0.28, 3.3], calf: [3.3, 3.6, 0.3, 2.05],
                           upper: [3.5, 3.35, 0.35, 2.55], fore: [2.55, 2.7, 0.22, 1.8], hand: 1.0, foot: 1.0 },
            androgynous: { sh: 11.0, del: 4.3, tf: 6.3, tb: -7.8, chest: 8.8, back: 9.4, bust: null,
                           hf: 2.6, hb: -8.0, hw: 11.2, cleft: 0.6, leg: 5.0,
                           thigh: [4.75, 4.55, 0.28, 3.45], calf: [3.45, 3.75, 0.3, 2.2],
                           upper: [3.8, 3.6, 0.35, 2.75], fore: [2.75, 2.9, 0.22, 1.95], hand: 1.04, foot: 1.02 },
            male:        { sh: 12.5, del: 4.8, tf: 6.6, tb: -8.0, chest: 10.0, back: 10.8, bust: null,
                           hf: 2.5, hb: -7.5, hw: 10.8, cleft: 0.4, leg: 4.9,
                           thigh: [4.85, 4.65, 0.28, 3.6], calf: [3.6, 3.95, 0.3, 2.35],
                           upper: [4.2, 4.0, 0.35, 3.0], fore: [3.0, 3.2, 0.22, 2.1], hand: 1.1, foot: 1.05 },
        };
        const BOOT_SHAFT = [2.7, 3.05, 0.5, 3.7];                            // a boot, ankle → top of the shaft

        /** The body for a gender and build: shoulders follow `shoulder`, the pelvis and legs `hip`. Cached. */
        const _bodyCanons = new Map();
        function bodyCanon(gender, buildId) {
            const key = (BODY_CANON[gender] ? gender : 'androgynous') + '|' + (buildId || '');
            let C = _bodyCanons.get(key);
            if (C) return C;
            const b = BUILDS[buildId] || {};
            C = { ...BODY_CANON[gender] || BODY_CANON.androgynous, paths: new Map() };
            if (b.shoulder) { const k = b.shoulder; C.sh *= k; C.del *= 1 + (k - 1) * 0.8; C.chest *= 1 + (k - 1) * 0.6; C.back *= 1 + (k - 1) * 0.7; }
            if (b.hip) { const k = b.hip; C.hw *= k; C.hb *= 1 + (k - 1) * 0.6; C.leg *= 1 + (k - 1) * 0.5; C.cleft *= k; }
            _bodyCanons.set(key, C);
            return C;
        }

        /** A closed Catmull-Rom spline through [[x, y], …] as béziers, pushed out by `inflate`, always
         *  wound the same way (so paths added to it, like a thumb, fill as one shape). */
        function _bodySpline(pts, inflate = 0, path = new Path2D()) {
            const n = pts.length;
            let area = 0;
            for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
            if (area < 0) pts = pts.slice().reverse();
            const P = i => pts[(i % n + n) % n];
            const q = !inflate ? pts : pts.map((p, i) => {
                const a = P(i - 1), b = P(i + 1), tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
                return [p[0] + ty / l * inflate, p[1] - tx / l * inflate];
            });
            const Q = i => q[(i % n + n) % n];
            path.moveTo(q[0][0], q[0][1]);
            for (let i = 0; i < n; i++) {
                const p0 = Q(i - 1), p1 = Q(i), p2 = Q(i + 1), p3 = Q(i + 2);
                path.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
                                   p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
            }
            path.closePath();
            return path;
        }
        /** One side's points (front → back, +y), mirrored into a closed outline. */
        function _bodyMirror(front, side, back) {
            return [front, ...side, back, ...side.slice().reverse().map(([x, y]) => [x, -y])];
        }
        function _bodyCached(C, key, make) {
            let p = C.paths.get(key);
            if (!p) C.paths.set(key, p = make());
            return p;
        }

        /** The torso: chest across the front, shoulder blades and a shallow spine behind, ending at the
         *  shoulder joints (the deltoid caps go on top). `band` keeps only |y| ≤ band of it (a tank top). */
        function bodyTorsoPath(C, inflate = 0, band = 0) {
            return _bodyCached(C, 't' + inflate + '|' + band, () => {
                const { tf, tb, chest, back, sh, del } = C, lim = band || Infinity;
                const side = [
                    [tf - 0.9, chest * 0.55],               // the chest
                    [tf - 2.6, chest],                      // where it turns into the shoulder
                    [del * 0.35, sh + del * 0.28],          // shoulder joint, front
                    [-del * 0.65, sh + del * 0.12],         // shoulder joint, back
                    [tb + 2.0, back],                       // shoulder blade
                    [tb, back * 0.42],
                ].map(([x, y]) => [x, Math.min(y, lim)]);
                return _bodySpline(_bodyMirror([tf, 0], side, [tb + 0.35, 0]), inflate);
            });
        }
        /** The pelvis: widest at the hip bones, rounding into the seat, a soft cleft behind. */
        function bodyHipPath(C, inflate = 0) {
            return _bodyCached(C, 'h' + inflate, () => {
                const { hf, hb, hw, cleft } = C;
                return _bodySpline(_bodyMirror([hf, 0], [
                    [hf - 0.8, hw * 0.55],
                    [hf - 3.2, hw * 0.93],
                    [(hf + hb) / 2 - 0.6, hw],              // hip bones
                    [hb + 2.4, hw * 0.86],
                    [hb + 0.25, hw * 0.42],                 // the seat
                ], [hb + cleft, 0]), inflate);
            });
        }

        /** The head from above: an egg, longer than wide and fuller behind; the ears as one path. */
        let _bodyHead = null, _bodyEars = null;
        function bodyHeadPaths() {
            if (!_bodyHead) {
                _bodyHead = _bodySpline(_bodyMirror([7.8, 0], [[6.5, 4.9], [2.6, 7.0], [-1.0, 7.35], [-5.0, 6.4], [-7.6, 3.6]], [-8.4, 0]));
                _bodyEars = new Path2D();
                for (const s of [-1, 1]) { _bodyEars.moveTo(1.3, s * 7.05); _bodyEars.ellipse(-0.4, s * 7.05, 1.7, 1.15, 0, 0, Math.PI * 2); }
            }
            return { head: _bodyHead, ears: _bodyEars };
        }

        /** A limb segment from joint (x1, y1) to joint (x2, y2), tapered by T, as the current path. */
        function bodyLimbPath(ctx, x1, y1, x2, y2, T) {
            const r0 = T[0], rb = T[1], tb = T[2], r1 = T[3];
            const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1e-6, a = Math.atan2(dy, dx);
            const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
            const c1 = Math.max(0.05, tb * 0.85) * L, c2 = (tb + (1 - tb) * 0.5) * L;
            const w1 = Math.max(rb * 1.05, r0), w2 = (rb + r1) * 0.5;
            ctx.beginPath();
            ctx.arc(x1, y1, r0, a + Math.PI / 2, a + Math.PI * 1.5);
            ctx.bezierCurveTo(x1 + ux * c1 - nx * w1, y1 + uy * c1 - ny * w1, x1 + ux * c2 - nx * w2, y1 + uy * c2 - ny * w2, x2 - nx * r1, y2 - ny * r1);
            ctx.arc(x2, y2, r1, a - Math.PI / 2, a + Math.PI / 2);
            ctx.bezierCurveTo(x1 + ux * c2 + nx * w2, y1 + uy * c2 + ny * w2, x1 + ux * c1 + nx * w1, y1 + uy * c1 + ny * w1, x1 + nx * r0, y1 + ny * r0);
            ctx.closePath();
        }
        /** A limb's radius a fraction t of the way along it (for bangles, cuffs). */
        function bodyLimbRadius(T, t) {
            return t <= T[2] ? T[0] + (T[1] - T[0]) * t / T[2] : T[1] + (T[3] - T[1]) * (t - T[2]) / (1 - T[2]);
        }

        /** A hand in its own frame (x along the forearm, origin at the fist point), thumb included.
         *  Relaxed: seen from the thumb side, shortened by reach k (0 hanging straight down … 1 reaching
         *  out, in 8 steps). Gripping: a fist. t: the thumb's side. Cached per size. */
        const _bodyHands = new Map();
        function bodyHandPath(grip, k, t, size) {
            const ks = grip ? 0 : Math.round(k * 7), key = (grip ? 'g' : ks) + '|' + t + '|' + size;
            let p = _bodyHands.get(key);
            if (p) return p;
            const z = size, K = ks / 7, S = pts => pts.map(([x, y]) => [x * z, y * z]);
            if (grip) {
                p = _bodySpline(S([[-2.2, 0], [-2.0, 2.45], [1.0, 2.9], [3.3, 2.65], [4.15, 1.2], [4.2, -1.2], [3.3, -2.65], [1.0, -2.9], [-2.0, -2.45]]));
                _bodyThumb(p, 1.2 * z, t * 2.1 * z, 1.55 * z, 1.05 * z, t * 0.25);
            } else {
                const palm = 0.4 + 1.0 * K, kn = 0.8 + 4.4 * K, tip = 1.4 + 5.6 * K;     // a hanging hand is seen end-on
                p = _bodySpline(S([[-2.0, 0], [-1.6, 1.95], [palm, 2.3], [kn, 1.8], [tip, 0.55], [tip, -0.55], [kn, -1.8], [palm, -2.3], [-1.6, -1.95]]));
                const tx = 0.5 + 1.5 * K, rx = 1.2 + 0.55 * K;
                _bodyThumb(p, tx * z, t * 2.2 * z, rx * z, 1.0 * z, t * 0.35);
            }
            _bodyHands.set(key, p);
            return p;
        }
        function _bodyThumb(p, x, y, rx, ry, rot) {                   // its own subpath, started where the ellipse starts
            p.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
        }
        /** Fill a cached path placed at (x, y) and turned by a, undoing the move exactly (cheaper than save/restore).
         *  The context's current path is cleared first: the browser re-maps it through every transform. */
        function _bodyFillAt(ctx, path, x, y, a) {
            ctx.beginPath();
            if (!a) { ctx.translate(x, y); ctx.fill(path); ctx.translate(-x, -y); return; }
            const c = Math.cos(a), s = Math.sin(a);
            ctx.transform(c, s, -s, c, x, y); ctx.fill(path); ctx.transform(c, -s, s, c, -(c * x + s * y), s * x - c * y);
        }
        /** Draw a hand at the fist point (fx, fy), turned along the forearm from the elbow (ex, ey). */
        function drawBodyHand(ctx, ex, ey, fx, fy, grip, C) {
            const dx = fx - ex, dy = fy - ey, L = Math.hypot(dx, dy);
            const a = L > 0.3 ? Math.atan2(dy, dx) : (fy < 0 ? -Math.PI / 2 : Math.PI / 2);
            // the thumb sits toward the body's midline (and a little forward)
            const t = (-Math.sin(a) * 0.4 + Math.cos(a) * (fy < 0 ? 1 : -1)) >= 0 ? 1 : -1;
            _bodyFillAt(ctx, bodyHandPath(grip, Math.min(1, L / 10), t, C.hand), fx, fy, a);
        }

        /** A foot around its ankle point: a narrow heel, the arch on the inside, wide across the ball,
         *  toes stepping back from the big toe, turned out a little. side −1 left, +1 right; `inflate`
         *  makes it a shoe; `pump` a pointed court shoe. Cached with size and turn-out baked in. */
        const _bodyFeet = new Map();
        function bodyFootPath(side, inflate, pump, size) {
            const key = side + '|' + inflate + '|' + (pump ? 1 : 0) + '|' + size;
            let p = _bodyFeet.get(key);
            if (p) return p;
            const s = side, c = Math.cos(s * 0.09), n = Math.sin(s * 0.09);
            const pts = (pump
                ? [[-3.0, 0], [-2.3, 1.7 * s], [1.8, 2.15 * s], [5.4, 2.5 * s], [7.8, 1.45 * s], [9.4, -0.3 * s], [8.0, -1.85 * s], [5.4, -2.45 * s], [1.8, -1.75 * s], [-2.3, -1.7 * s]]
                : [[-3.2, 0], [-2.3, 1.95 * s], [1.8, 2.45 * s], [5.6, 2.8 * s], [7.8, 1.95 * s], [8.8, 0.5 * s], [9.2, -0.9 * s], [8.5, -2.2 * s], [5.6, -2.75 * s], [1.8, -1.9 * s], [-2.3, -1.9 * s]])
                .map(([x, y]) => [(x * c - y * n) * size, (x * n + y * c) * size]);
            p = _bodySpline(pts, inflate);
            _bodyFeet.set(key, p);
            return p;
        }
        function drawBodyFoot(ctx, x, y, side, inflate, pump, size) {
            _bodyFillAt(ctx, bodyFootPath(side, inflate, pump, size), x, y, 0);
        }

        /** The deltoid caps over the shoulder joints (0, ±sh in the torso frame), leaning toward each
         *  elbow (given in the torso frame) as the arm lifts. `stripe`: a sleeve stripe across each;
         *  `seam`: the armhole seam round each cap's inner side (a T-shirt's). */
        function drawBodyCaps(ctx, C, color, lex, ley, rex, rey, pad = 0, stripe = null, seam = false) {
            ctx.fillStyle = color;
            const both = !stripe && !seam;                                  // plain caps: one path for the pair
            if (both) ctx.beginPath();
            for (let i = 0; i < 2; i++) {
                const s = i ? 1 : -1, ex = i ? rex : lex, ey = i ? rey : ley;
                const y0 = s * C.sh, dy = ey - y0, L = Math.hypot(ex, dy), w = Math.min(1, L / 7);
                let ux = (L > 0.01 ? ex / L : 1) * w + (1 - w), uy = (L > 0.01 ? dy / L : 0) * w;
                const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
                const cx = ux * C.del * 0.22, cy = y0 + uy * C.del * 0.22 - s * 0.3, rx = C.del * 1.06 + pad;
                const ry = C.del * 0.8 + pad, rot = Math.atan2(uy, ux);
                if (both) { ctx.moveTo(cx + rx * ux, cy + rx * uy); ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); continue; }
                ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); ctx.fill();
                if (seam) {
                    const inner = -s * Math.PI / 2 - rot;                       // toward the body's midline, in the cap's own frame
                    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.6;
                    ctx.beginPath(); ctx.ellipse(cx, cy, rx - 0.3, ry - 0.3, rot, inner - 1.2, inner + 1.2); ctx.stroke();
                }
                if (stripe) {
                    ctx.strokeStyle = stripe; ctx.lineWidth = 0.8;
                    ctx.beginPath(); ctx.moveTo(cx - ux * rx * 0.8, cy - uy * rx * 0.8); ctx.lineTo(cx + ux * rx * 0.8, cy + uy * rx * 0.8); ctx.stroke();
                }
            }
            if (both) ctx.fill();
            ctx.beginPath();                                                // leave no path for the next transform to carry
        }

        /** How wide a build's shoulders read in a portrait (1 = classic). */
        function portraitBreadth(config) {
            const b = BUILDS[config.build];
            return b ? b.w * (b.shoulder || 1) : 1;
        }

        /** Colours for an android body config, or null for a human. */
        function androidLook(body) {
            if (!body || body.kind !== 'android') return null;
            const f = ANDROID_FINISHES[body.finish] || ANDROID_FINISHES.silver;
            return { ...f, glow: body.glow || f.glow, hover: !!body.hover, emblem: body.emblem !== false };
        }

        /** The Double Nights mark: two overlapping crescent moons. */
        function drawDNEmblem(ctx, x, y, r, color) {
            ctx.save();
            ctx.strokeStyle = color; ctx.lineWidth = r * 0.42; ctx.lineCap = 'round';
            for (const dx of [-r * 0.32, r * 0.32]) {
                ctx.beginPath(); ctx.arc(x + dx, y, r, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
            }
            ctx.restore();
        }

        /** An android's head from above: a polished dome with a glowing visor across the face. */
        function drawAndroidHead(ctx, headX, A, blink) {
            const g = ctx.createRadialGradient(headX - 2, -2.5, 1, headX, 0, 8.5);
            g.addColorStop(0, A.sheen); g.addColorStop(0.45, A.plate); g.addColorStop(1, A.trim);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(headX, 0, 8, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = A.trim; ctx.lineWidth = 0.6;                        // crown seam
            ctx.beginPath(); ctx.moveTo(headX - 6.5, 0); ctx.lineTo(headX + 2, 0); ctx.stroke();
            // Visor: a band wrapping the front of the head; a blink is a flicker
            ctx.save();
            ctx.globalAlpha = 1 - 0.7 * blink;
            ctx.strokeStyle = A.glow; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
            ctx.shadowColor = A.glow; ctx.shadowBlur = 4;
            ctx.beginPath(); ctx.arc(headX, 0, 6.6, -0.75, 0.75); ctx.stroke();
            ctx.restore();
        }

        /**
         * An android's face for portraits: polished plating, seams, and a glowing visor
         * that carries the expression (it curves with a smile, droops when sad, narrows
         * when half-lidded, and pulses while talking).
         */
        function drawAndroidPortraitFace(ctx, P, A, X, blink, talk) {
            const { cx, cy, fw, fh } = P;
            // Sheen across the brow and cheek
            const sh = ctx.createRadialGradient(cx - fw * 0.35, cy - fh * 0.45, 0, cx - fw * 0.35, cy - fh * 0.45, fw * 1.1);
            sh.addColorStop(0, A.sheen); sh.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = sh;
            ctx.beginPath(); ctx.ellipse(cx, cy, fw, fh, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
            // Seams: jawline, a cheek panel either side, the centre of the brow
            ctx.strokeStyle = A.trim; ctx.lineWidth = Math.max(0.6, fw * 0.03); ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.moveTo(cx - fw * 0.82, cy + fh * 0.25); ctx.quadraticCurveTo(cx, cy + fh * 1.02, cx + fw * 0.82, cy + fh * 0.25);
            for (const s of [-1, 1]) { ctx.moveTo(cx + s * fw * 0.72, cy - fh * 0.05); ctx.lineTo(cx + s * fw * 0.55, cy + fh * 0.45); }
            ctx.moveTo(cx, cy - fh * 0.95); ctx.lineTo(cx, cy - fh * 0.55);
            ctx.stroke(); ctx.globalAlpha = 1;
            // Visor
            const eyeY = cy - fh * 0.15;
            const open = Math.max(0.12, 1 - Math.max(X.lids.top, blink) * 0.85);
            const bend = X.mouth.curve * fh * 0.08 - X.brow.tilt * fh * 0.03;    // smile curves it up at the ends
            const bright = Math.max(0.35, 0.85 + X.blush * 0.15 - Math.max(0, -X.mouth.curve) * 0.3 + talk * 0.25);
            ctx.save();
            ctx.shadowColor = A.glow; ctx.shadowBlur = fw * 0.35;
            ctx.globalAlpha = bright; ctx.fillStyle = A.glow;
            const w = fw * 0.82, h = fh * 0.13 * open;
            ctx.beginPath();
            ctx.moveTo(cx - w, eyeY - bend);
            ctx.quadraticCurveTo(cx, eyeY + bend - h * 1.4, cx + w, eyeY - bend);
            ctx.quadraticCurveTo(cx, eyeY + bend + h * 1.4, cx - w, eyeY - bend);
            ctx.fill();
            ctx.restore();
            // Pupils of light, following the gaze
            ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.85 * open;
            for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * fw * 0.38 + X.gaze.x * fw * 0.1, eyeY + X.gaze.y * fh * 0.03, fw * 0.06, 0, Math.PI * 2); ctx.fill(); }
            ctx.globalAlpha = 1;
            // Speaker grille where a mouth would be; it glows while talking
            const my = cy + fh * 0.5 - X.mouth.curve * fh * 0.03;
            ctx.strokeStyle = talk > 0 ? A.glow : A.trim; ctx.lineWidth = Math.max(0.6, fw * 0.035); ctx.globalAlpha = talk > 0 ? 0.6 + talk * 0.4 : 0.7;
            ctx.beginPath();
            for (let i = -1; i <= 1; i++) { const yy = my + i * fh * 0.045; ctx.moveTo(cx - fw * 0.22, yy); ctx.lineTo(cx + fw * 0.22, yy); }
            ctx.stroke(); ctx.globalAlpha = 1;
        }

