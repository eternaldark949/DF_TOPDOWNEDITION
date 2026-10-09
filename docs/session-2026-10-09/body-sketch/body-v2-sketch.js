        /* =====================================================================
           BODY V2 SKETCH — the proposed procedural body, part by part
           ---------------------------------------------------------------------
           Preview code only (not in the game build). render-sheets.cjs splices it
           into a scratch copy of "DFAB V8.html" with a handful of hooks in
           _drawHumanoidBody and WARDROBE, then switches parts on one at a time:

             BODY_SKETCH = { limbs, hands, feet, torso, hips, head }   (all false = today's body)

           Joints, poses, stride, muzzles and collision stay where they are.
           What changes is the shape drawn between the joints, plus three
           attachment fixes so the new shapes stay joined:
             - shoulder joints sit on the deltoids (female 7 → 10.5, androgynous 9 → 11, male 12 → 12.5)
             - arm roots turn with the torso's twist, leg roots with the hips' sway
             - leg roots get their own spacing (they no longer reuse the hip depth)

           Frames are the renderer's: +x is facing, y runs shoulder to shoulder.
           Torso and hip numbers are in their own frames (origin at the hip anchor,
           3px behind the head's centre). Limb tapers are [near r, belly r, belly at, far r].
           ===================================================================== */
        const BODY_SKETCH = { limbs: false, hands: false, feet: false, torso: false, hips: false, head: false };

        const BODY_CANON = {
            //            shoulders           torso depth      chest / upper back   bust (female)
            female:      { sh: 10.5, del: 4.0, tf: 6.0, tb: -7.2, chest: 7.8, back: 8.8, bust: { x: 5.4, y: 4.9, r: 3.3 },
            //            pelvis                               leg roots
                           hf: 3.0, hb: -9.0, hw: 12.0, cleft: 0.8, leg: 5.4,
                           thigh: [4.7, 4.5, 0.28, 3.3], calf: [3.3, 3.6, 0.3, 2.05],
                           upper: [3.5, 3.35, 0.35, 2.55], fore: [2.55, 2.7, 0.22, 1.8],
                           hand: 1.0, foot: 1.0 },
            androgynous: { sh: 11.0, del: 4.3, tf: 6.3, tb: -7.8, chest: 8.8, back: 9.4, bust: null,
                           hf: 2.6, hb: -8.0, hw: 11.2, cleft: 0.6, leg: 5.0,
                           thigh: [4.75, 4.55, 0.28, 3.45], calf: [3.45, 3.75, 0.3, 2.2],
                           upper: [3.8, 3.6, 0.35, 2.75], fore: [2.75, 2.9, 0.22, 1.95],
                           hand: 1.04, foot: 1.02 },
            male:        { sh: 12.5, del: 4.8, tf: 6.6, tb: -8.0, chest: 10.0, back: 10.8, bust: null,
                           hf: 2.5, hb: -7.5, hw: 10.8, cleft: 0.4, leg: 4.9,
                           thigh: [4.85, 4.65, 0.28, 3.6], calf: [3.6, 3.95, 0.3, 2.35],
                           upper: [4.2, 4.0, 0.35, 3.0], fore: [3.0, 3.2, 0.22, 2.1],
                           hand: 1.1, foot: 1.05 },
        };
        const _SK_BOOT = [2.7, 3.05, 0.5, 3.7];            // a boot shaft, ankle → top

        /** The canon for a gender and build (ui/bodies.js BUILDS): shoulders and pelvis follow the build. */
        const _skCanons = new Map();
        function _sketchCanon(gender, buildId) {
            const key = gender + '|' + (buildId || '');
            let C = _skCanons.get(key);
            if (C) return C;
            const base = BODY_CANON[gender] || BODY_CANON.androgynous, b = BUILDS[buildId] || {};
            C = { ...base, key };
            if (b.shoulder) { const k = b.shoulder; C.sh *= k; C.del *= 1 + (k - 1) * 0.8; C.chest *= 1 + (k - 1) * 0.6; C.back *= 1 + (k - 1) * 0.7; }
            if (b.hip) { const k = b.hip; C.hw *= k; C.hb *= 1 + (k - 1) * 0.6; C.leg *= 1 + (k - 1) * 0.5; C.cleft *= k; }
            C.paths = new Map();
            _skCanons.set(key, C);
            return C;
        }

        /* ── Path helpers ── */
        /** A closed Catmull-Rom spline through points [[x, y], ...], as cubic béziers, into a Path2D. */
        function _skSpline(pts, inflate = 0) {
            const n = pts.length, P = i => pts[(i % n + n) % n];
            let q = pts;
            if (inflate) {                                               // push each point out along its normal
                let area = 0;
                for (let i = 0; i < n; i++) { const a = P(i), b = P(i + 1); area += a[0] * b[1] - b[0] * a[1]; }
                const sgn = area > 0 ? 1 : -1;
                q = pts.map((p, i) => {
                    const a = P(i - 1), b = P(i + 1), tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
                    return [p[0] + sgn * ty / l * inflate, p[1] - sgn * tx / l * inflate];
                });
            }
            const Q = i => q[(i % n + n) % n], path = new Path2D();
            path.moveTo(q[0][0], q[0][1]);
            for (let i = 0; i < n; i++) {
                const p0 = Q(i - 1), p1 = Q(i), p2 = Q(i + 1), p3 = Q(i + 2);
                path.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
                                   p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
            }
            path.closePath();
            return path;
        }
        /** Mirror one side's points (front → back, +y) into a closed outline with front and back centre points. */
        function _skMirror(front, side, back) {
            return [front, ...side, back, ...side.slice().reverse().map(([x, y]) => [x, -y])];
        }

        /* ── Torso: the chest and back seen from above ──
           The core runs from the chest across the front to the shoulder blades
           and a shallow spine behind; it stops at the shoulder joints. The
           deltoids are drawn on top as their own caps (_sketchCaps): from above,
           the shoulders are the highest thing after the head. */
        function _sketchTorsoPath(C, inflate = 0) {
            const k = 't' + inflate;
            let p = C.paths.get(k);
            if (p) return p;
            const { tf, tb, chest, back, sh, del } = C;
            p = _skSpline(_skMirror([tf, 0], [
                [tf - 0.9, chest * 0.55],               // the chest
                [tf - 2.6, chest],                      // where it turns into the shoulder
                [del * 0.35, sh + del * 0.28],          // shoulder joint, front
                [-del * 0.65, sh + del * 0.12],         // shoulder joint, back
                [tb + 2.0, back],                       // shoulder blade
                [tb, back * 0.42],
            ], [tb + 0.35, 0]), inflate);
            C.paths.set(k, p);
            return p;
        }
        /** The deltoids: a cap over each shoulder joint (0, ±sh in the torso frame), drawn over the
         *  torso's edge and leaning toward the elbow (given in the torso frame) as the arm lifts. */
        function _sketchCaps(ctx, C, color, lex, ley, rex, rey, pad = 0) {
            ctx.fillStyle = color;
            for (const [s, ex, ey] of [[-1, lex, ley], [1, rex, rey]]) {
                const ry0 = s * C.sh, dx = ex, dy = ey - ry0, L = Math.hypot(dx, dy), w = Math.min(1, L / 7);
                let ux = (L > 0.01 ? dx / L : 1) * w + (1 - w), uy = (L > 0.01 ? dy / L : 0) * w;
                const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
                ctx.beginPath();
                ctx.ellipse(ux * C.del * 0.22, ry0 + uy * C.del * 0.22 - s * 0.3, C.del * 1.06 + pad, C.del * 0.8 + pad, Math.atan2(uy, ux), 0, Math.PI * 2);
                ctx.fill();
            }
        }
        /** Fill the torso (inflated for padded/outer layers), optionally only the band |y| ≤ limit (tank straps). */
        function _sketchFillTorso(ctx, C, color, y0, y1, inflate) {
            ctx.fillStyle = color;
            const lim = Math.min(Math.abs(y0), Math.abs(y1));
            if (lim >= 10) { ctx.fill(_sketchTorsoPath(C, inflate)); return; }
            const band = lim / 10 * C.sh;                                // the old ±10 rect spans shoulder to shoulder
            ctx.save(); ctx.beginPath(); ctx.rect(-40, -band, 80, band * 2); ctx.clip();
            ctx.fill(_sketchTorsoPath(C, inflate)); ctx.restore();
        }

        /* ── Pelvis: widest at the hip bones, rounding into the seat, a soft cleft behind ── */
        function _sketchHipPath(C, inflate = 0) {
            const k = 'h' + inflate;
            let p = C.paths.get(k);
            if (p) return p;
            const { hf, hb, hw, cleft } = C;
            p = _skSpline(_skMirror([hf, 0], [
                [hf - 0.8, hw * 0.55],
                [hf - 3.2, hw * 0.93],
                [(hf + hb) / 2 - 0.6, hw],              // hip bones
                [hb + 2.4, hw * 0.86],
                [hb + 0.25, hw * 0.42],                 // the seat
            ], [hb + cleft, 0]), inflate);
            C.paths.set(k, p);
            return p;
        }
        function _sketchFillHip(ctx, C, color, inflate) { ctx.fillStyle = color; ctx.fill(_sketchHipPath(C, inflate)); }

        /* ── Head: an egg, longer than wide, fuller at the back; ears just showing ── */
        const _SK_HEAD = _skSpline(_skMirror([7.8, 0], [[6.5, 4.9], [2.6, 7.0], [-1.0, 7.35], [-5.0, 6.4], [-7.6, 3.6]], [-8.4, 0]));
        function _sketchHead(ctx, headX, skin) {
            ctx.fillStyle = darkenHex(skin, 26);
            for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(headX - 0.4, s * 7.05, 1.7, 1.15, 0, 0, Math.PI * 2); ctx.fill(); }
            ctx.fillStyle = skin;
            ctx.save(); ctx.translate(headX, 0); ctx.fill(_SK_HEAD); ctx.restore();
        }

        /* ── Limbs: tapered, with a belly, round at each joint ──
           Each segment ends in a circle the size of the joint, and the next
           segment starts with the same circle, so knees and elbows stay joined
           instead of pinching where two ellipse tips meet. */
        function _sketchLimbPath(ctx, x1, y1, x2, y2, T) {
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
        /** drawLimb's tapered version: same colours and the same matte shade / gloss as today's limbs. */
        function _sketchLimb(ctx, SH, x1, y1, x2, y2, T, color, gloss) {
            ctx.fillStyle = color;
            _sketchLimbPath(ctx, x1, y1, x2, y2, T); ctx.fill();
            if (!SH) return;
            const len = Math.hypot(x2 - x1, y2 - y1) / 2 + 2, ang = Math.atan2(y2 - y1, x2 - x1), width = Math.max(T[0], T[1]);
            const c = Math.cos(ang), s = Math.sin(ang), ly = -s * SH.lx + c * SH.ly, lx = (c * SH.lx + s * SH.ly) * len * 0.1;
            ctx.save(); ctx.translate((x1 + x2) / 2, (y1 + y2) / 2); ctx.rotate(ang);
            if (gloss) {
                ctx.fillStyle = SH.hl2;
                ctx.beginPath(); ctx.ellipse(lx, ly * width * 0.4, len * 0.78, width * 0.32, 0, 0, Math.PI * 2); ctx.fill();
            } else if (SH.lx || SH.ly) {
                _softSpot(ctx, -lx, -ly * width * 0.75, len * 1.6, width * 1.3, _SHADOW_RGB, SH.shA * 1.3);
            }
            ctx.restore();
        }

        /* ── Hands: turned along the forearm ──
           Relaxed: a slim hand seen from its thumb side, shortened when the arm
           hangs straight down (k). Gripping (a gun, a glass, a guard): a fist. */
        function _sketchHand(ctx, ex, ey, fx, fy, grip, C) {
            const dx = fx - ex, dy = fy - ey, L = Math.hypot(dx, dy), a = L > 0.3 ? Math.atan2(dy, dx) : (fy < 0 ? -Math.PI / 2 : Math.PI / 2);
            const k = Math.min(1, L / 10), z = C.hand;                    // k: 0 hanging straight down … 1 reaching out
            // the thumb sits toward the body's midline (and a little forward)
            const nx = -Math.sin(a), ny = Math.cos(a), t = (nx * 0.4 + ny * (fy < 0 ? 1 : -1)) >= 0 ? 1 : -1;
            ctx.save(); ctx.translate(fx, fy); ctx.rotate(a); ctx.scale(z, z);
            ctx.beginPath();
            if (grip) {
                _skPoly(ctx, [[-2.2, 0], [-2.0, 2.45], [1.0, 2.9], [3.3, 2.65], [4.15, 1.2], [4.2, -1.2], [3.3, -2.65], [1.0, -2.9], [-2.0, -2.45]]);
                ctx.fill(); ctx.beginPath(); ctx.ellipse(1.2, t * 2.1, 1.55, 1.05, t * 0.25, 0, Math.PI * 2);
            } else {
                const palm = 0.4 + 1.0 * k, kn = 0.8 + 4.4 * k, tip = 1.4 + 5.6 * k;   // a hanging hand is seen end-on
                _skPoly(ctx, [[-2.0, 0], [-1.6, 1.95], [palm, 2.3], [kn, 1.8], [tip, 0.55], [tip, -0.55], [kn, -1.8], [palm, -2.3], [-1.6, -1.95]]);
                ctx.fill(); ctx.beginPath(); ctx.ellipse(0.5 + 1.5 * k, t * 2.2, 1.2 + 0.55 * k, 1.0, t * 0.35, 0, Math.PI * 2);
            }
            ctx.fill();
            ctx.restore();
        }
        /** A closed Catmull-Rom outline straight onto the context (for shapes that change every frame). */
        function _skPoly(ctx, pts) {
            const n = pts.length, P = i => pts[(i % n + n) % n];
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 0; i < n; i++) {
                const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
                ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
                                  p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
            }
            ctx.closePath();
        }

        /* ── Feet: a narrow heel, the arch on the inside, wide across the ball,
           toes stepping back from the big toe; turned out a little ── */
        let _skFootK = 1;                                                  // this body's foot size, for the shoes (set per draw)
        const _skFeet = new Map();
        function _sketchFootPath(side, inflate, pump) {
            const key = side + '|' + inflate + '|' + (pump ? 1 : 0);
            let p = _skFeet.get(key);
            if (p) return p;
            const s = side;                                                   // +s is the outside of the foot
            const pts = pump
                ? [[-3.0, 0], [-2.3, 1.7 * s], [1.8, 2.15 * s], [5.4, 2.5 * s], [7.8, 1.45 * s], [9.4, -0.3 * s], [8.0, -1.85 * s], [5.4, -2.45 * s], [1.8, -1.75 * s], [-2.3, -1.7 * s]]
                : [[-3.2, 0], [-2.3, 1.95 * s], [1.8, 2.45 * s], [5.6, 2.8 * s], [7.8, 1.95 * s], [8.8, 0.5 * s], [9.2, -0.9 * s], [8.5, -2.2 * s], [5.6, -2.75 * s], [1.8, -1.9 * s], [-2.3, -1.9 * s]];
            p = _skSpline(pts, inflate);
            _skFeet.set(key, p);
            return p;
        }
        /** A foot at its ankle point (fx, fy); side −1 left, +1 right. Fill style is the caller's. */
        function _sketchFoot(ctx, fx, fy, side, inflate, pump, scale = 1) {
            ctx.save(); ctx.translate(fx, fy); ctx.rotate(side * 0.09); if (scale !== 1) ctx.scale(scale, scale);
            ctx.fill(_sketchFootPath(side, inflate, pump));
            ctx.restore();
        }
