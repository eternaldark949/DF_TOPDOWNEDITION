        /* =====================================================================
           BODIES — builds, height, and Double Nights androids
           ---------------------------------------------------------------------
           config.build   'slim' | 'athletic' | 'curvy' | 'broad' | 'heavy'
                          (none = the classic shape for the character's gender)
           config.height  0.9 … 1.1 (1 = classic)
           config.body    { kind: 'android', finish: 'silver' | 'gold' | 'bloodmoon',
                            glow: '#hex' (visor colour), hover: true, emblem: false }
           Builds scale the body (breadth y, depth x) and keep the head's shape;
           height scales everything. Both are visual only — collision is unchanged.

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

