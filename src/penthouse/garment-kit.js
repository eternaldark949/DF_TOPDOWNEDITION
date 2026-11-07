        // ===== LV3 PENTHOUSE =====
        // THE GARMENT KIT (trial; not in the game build yet): clothes written once as DATA, drawn by any
        // renderer. A garment is a list of op packets laid on the humanoid's skeleton (the rig's geometry
        // packet `g`); garmentKit.canvas draws it with Canvas 2D, garmentKit.gl hands the same packet to
        // the WebGL humanoid (penthouse/gl-humanoid.js) as shapes. Neither knows the other exists.
        //
        // ANCHORS: 'hip_l' 'hip_r' 'knee_l' 'knee_r' 'foot_l' 'foot_r' (the skeleton), 'back' and 'front'
        // (the hips' back and front edge on the centre line).
        // POINT PACKET: [anchor, dx, dy, scale]   scale 'hw' multiplies dy by the hips' half-width
        //
        // OP PACKETS (dark: how much darker than the item's colour, as the wardrobe's g.darken):
        //   ['band', from, to, reach, radius, dark]   cloth wrapped round a limb, from one anchor `reach` of
        //                                             the way to another, `radius` thick (round ends)
        //   ['hips', grow, dark]                      the hip shape (ui/bodies.js bodyHipPath), grown by `grow`
        //   ['seam', dark, width, [point, ...]]        a stitched line through points
        //
        //   GARMENTS.pencil_skirt = [['band', 'hip_l', 'knee_l', 0.55, 3.25, 0.18], ...];
        //   garmentKit.canvas(ctx, g, GARMENTS.pencil_skirt, item);       // in the hips' frame
        const GARMENTS = {
            // Pencil skirt: snug over the thighs to just above the knee, a back slit and a waist seam
            pencil_skirt: [
                ['band', 'hip_l', 'knee_l', 0.55, 3.25, 0.18],
                ['band', 'hip_r', 'knee_r', 0.55, 3.25, 0.18],
                ['hips', 0.3, 0.18],
                ['seam', 0.34, 0.6, [['back', 0.5, -2], ['back', -1.5, 0], ['back', 0.5, 2]]],
                ['seam', 0.34, 0.6, [['front', -1.2, -0.6, 'hw'], ['front', -1.2, 0.6, 'hw']]],
            ],
            // T-shirt: the torso shape and the bust, short sleeves (the body's sleeves take the colour)
            tshirt: [['body', 0.1, -10, 10], ['bust', 0.16, 3]],
            // Pleated circle skirt: 16 pleats on the cloth sim, alternating shades (or `stripe`), a trim band,
            // a frill of two scallops per pleat, the hem line and the waistband
            pleated_skirt: [['pleats', 16, 0.12, 0.08, 0.34, 0.8, 1.5, 0.45, [7.5, 11, 0.34]]],
            // Loafers: dark soles and a small shine on each toe
            loafers: [['soles', 0.55], ['toe_shine', 'rgba(255,255,255,0.18)', 4.6, 2.5, 2]],
            // Bangles: two rings round each wrist, 1 and 2.3 up the forearm
            bangles: [['wrist_rings', [1, 2.3], 0.7, 0.9, 0.35]],
        };

        const garmentKit = {
            _pt: [0, 0],
            /** Where an anchor is in the geometry packet (a shared [x, y]: copy it before the next call). */
            anchor(g, name) {
                const P = this._pt, i = name.endsWith('_r') ? 1 : 0;
                if (name.startsWith('hip_')) { P[0] = g.hipPt[i][0]; P[1] = g.hipPt[i][1]; }
                else if (name.startsWith('knee_')) { P[0] = g.knees[i][0]; P[1] = g.knees[i][1]; }
                else if (name.startsWith('foot_')) { P[0] = g.feet[i][0]; P[1] = g.feet[i][1]; }
                else if (name === 'back') { P[0] = g.hip.x; P[1] = 0; }
                else if (name === 'front') { P[0] = g.hip.x + g.hip.w; P[1] = 0; }
                else { P[0] = 0; P[1] = 0; }
                return P;
            },
            /** A point packet → [x, y] (new array). */
            point(g, [name, dx = 0, dy = 0, scale]) {
                const a = this.anchor(g, name);
                return [a[0] + dx, a[1] + dy * (scale === 'hw' ? g.body.hw : 1)];
            },
            /** A band's two ends → [x1, y1, x2, y2]. */
            band(g, from, to, reach) {
                const a = this.anchor(g, from), x1 = a[0], y1 = a[1], b = this.anchor(g, to);
                return [x1, y1, x1 + (b[0] - x1) * reach, y1 + (b[1] - y1) * reach];
            },

            /** Draw a garment with Canvas 2D (ctx already in the frame the wardrobe draws that piece in). */
            canvas(ctx, g, packet, item) {
                for (const op of packet) {
                    if (op[0] === 'band') {
                        const [x1, y1, x2, y2] = this.band(g, op[1], op[2], op[3]);
                        ctx.lineCap = 'round'; ctx.strokeStyle = g.darken(item.color, op[5]); ctx.lineWidth = op[4] * 2;
                        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.lineCap = 'butt';
                    } else if (op[0] === 'hips') {
                        ctx.fillStyle = g.darken(item.color, op[2]); ctx.fill(bodyHipPath(g.body, op[1]));
                    } else if (op[0] === 'seam') {
                        ctx.strokeStyle = g.darken(item.color, op[1]); ctx.lineWidth = op[2]; ctx.beginPath();
                        op[3].forEach((p, k) => { const [x, y] = this.point(g, p); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
                        ctx.stroke();
                    } else if (op[0] === 'body') {                              // the torso (wardrobe `body`)
                        const B = g.body, reach = Math.min(-op[2], op[3]);
                        ctx.fillStyle = g.darken(item.color, op[1]);
                        ctx.fill(reach < 10 ? bodyTorsoPath(B, 0, Math.round(reach / 10 * B.sh * 4) / 4) : bodyTorsoPath(B, (reach - 10) * 0.8));
                    } else if (op[0] === 'bust') {
                        const B = g.body.bust; if (!B) continue;
                        ctx.fillStyle = g.darken(item.color, op[1]); ctx.beginPath();
                        for (const sy of [-1, 1]) { const p = new Path2D(); p.arc(B.x + 0.15, sy * B.y, B.r * (op[2] + 0.4) / 3.5, 0, Math.PI * 2); ctx.fill(p); }
                    } else if (op[0] === 'pleats') {
                        const ch = this.pleatChains(g, op[1]), N = op[1], tip = k => ch[k % N][ch[k % N].length - 1], root = k => ch[k % N][0];
                        const base = g.darken(item.color, op[2]), deep = item.stripe ? g.darken(item.stripe, op[3]) : g.darken(item.color, op[4]), trim = item.trim || '#f4eee6';
                        for (let i = 0; i < N; i++) {
                            const a0 = root(i), a1 = root(i + 1), t0 = tip(i), t1 = tip(i + 1);
                            ctx.fillStyle = i % 2 ? deep : base; ctx.beginPath();
                            ctx.moveTo(a0.x, a0.y); ctx.lineTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(a1.x, a1.y); ctx.closePath(); ctx.fill();
                        }
                        ctx.strokeStyle = trim; ctx.lineWidth = 0.9; ctx.beginPath();
                        for (let i = 0; i <= N; i++) { const t = tip(i), a = root(i), p = { x: a.x + (t.x - a.x) * op[5], y: a.y + (t.y - a.y) * op[5] }; ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y); }
                        ctx.stroke();
                        ctx.fillStyle = trim;
                        for (let i = 0; i < N; i++) {
                            const t0 = tip(i), t1 = tip(i + 1);
                            for (const f of [0.25, 0.75]) { const x = t0.x + (t1.x - t0.x) * f, y = t0.y + (t1.y - t0.y) * f; ctx.beginPath(); ctx.arc(x, y, op[6], 0, Math.PI * 2); ctx.fill(); }
                        }
                        ctx.strokeStyle = g.darken(item.color, op[7]); ctx.lineWidth = 0.5; ctx.beginPath();
                        for (let i = 0; i <= N; i++) { const t = tip(i); ctx[i ? 'lineTo' : 'moveTo'](t.x, t.y); }
                        ctx.stroke();
                        const [wx, wy, wd] = op[8], cx = g.hip.x + g.hip.w / 2;
                        ctx.fillStyle = g.darken(item.color, wd); ctx.beginPath(); ctx.ellipse(cx, 0, wx, wy, 0, 0, Math.PI * 2); ctx.fill();
                    } else if (op[0] === 'soles') {
                        for (let i = 0; i < 2; i++) { const [x, y] = g.feet[i]; ctx.fillStyle = g.darken(item.color, op[1]); drawBodyFoot(ctx, x, y, i ? 1 : -1, 0.45, false, g.body.foot); }
                    } else if (op[0] === 'toe_shine') {
                        for (let i = 0; i < 2; i++) { const [x, y] = g.feet[i]; ctx.fillStyle = op[1]; ctx.fillRect(x + op[2], y - 1 + (i ? 0.45 : -0.45), op[3], op[4]); }
                    } else if (op[0] === 'wrist_rings') {
                        this.wristRings(g, op, (x, y, R, a, k) => bodyRingHalf(ctx, x, y, R, a, k, item._side || 1), () => { ctx.strokeStyle = item._side === -1 ? g.darken(item.color || '#e8c27a', op[4]) : (item.color || '#e8c27a'); ctx.lineWidth = op[3]; ctx.beginPath(); }, () => ctx.stroke());
                    }
                }
            },

            /** The pleated skirt's cloth chains (the wardrobe's own spec, so the sim is shared). */
            pleatChains(g, N) {
                const S = WARDROBE.specs, cx = g.hip.x + g.hip.w / 2;
                return g.cloth('pleated_skirt', S.pieceSpec('pleated_skirt', cx, 0, 0, S.pleatedSpec));
            },
            /** Rings round each wrist: ring(x, y, R, angle, reach) for each, between begin() and end(). */
            wristRings(g, op, ring, begin, end) {
                begin();
                for (let i = 0; i < 2; i++) {
                    const [ex, ey] = g.elbows[i], [fx, fy] = g.fists[i];
                    const dx = fx - ex, dy = fy - ey, L = Math.hypot(dx, dy) || 1e-6, a = Math.atan2(dy, dx), k = bodyForearmReach(L);
                    for (const d of op[1]) { const t = Math.max(0, 1 - d * k / L); ring(ex + dx * t, ey + dy * t, bodyLimbRadius(g.body.fore, t) + op[2], a, k); }
                }
                end();
            },

            /** Draw a garment as WebGL shapes. `put` places them: put.capsule(x1, y1, x2, y2, r1, r2, rgb, sheen) and
             *  put.ellipse(cx, cy, axx, axy, rb, rgb, sheen), in the same frame as the Canvas version; R the renderer. */
            gl(R, g, packet, item, put, sheen = 0) {
                for (const op of packet) {
                    if (op[0] === 'band') {
                        const [x1, y1, x2, y2] = this.band(g, op[1], op[2], op[3]);
                        put.capsule(x1, y1, x2, y2, op[4], op[4], R.tone(g, item.color, op[5]), sheen);
                    } else if (op[0] === 'hips') {
                        const B = g.body, grow = op[1];                          // the hip outline, as its ellipse
                        put.ellipse((B.hf + B.hb) / 2 + B.cleft * 0.25, 0, (B.hf - B.hb) / 2 + grow, 0, B.hw + grow, R.tone(g, item.color, op[2]), sheen);
                    } else if (op[0] === 'seam') {
                        const rgb = R.tone(g, item.color, op[1]), pts = op[3].map(p => this.point(g, p)), r = op[2] / 2, t = R.tex;
                        R.tex = 3;                                               // a stitched line: no grain, no ink edge
                        for (let k = 1; k < pts.length; k++) put.capsule(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], r, r, rgb, 0);
                        R.tex = t;
                    } else if (op[0] === 'body') {
                        const B = g.body, reach = Math.min(-op[2], op[3]);
                        const pts = reach < 10 ? R.outline(B, 'torso', Math.round(reach / 10 * B.sh * 4) / 4) : R.outline(B, 'torso', 0, (reach - 10) * 0.8);
                        put.polygon(pts, R.tone(g, item.color, op[1]), sheen);
                    } else if (op[0] === 'bust') {
                        const B = g.body.bust; if (!B) continue;
                        const r = B.r * (op[2] + 0.4) / 3.5, rgb = R.tone(g, item.color, op[1]);
                        for (const sy of [-1, 1]) put.ellipse(B.x + 0.15, sy * B.y, r, 0, r, rgb, sheen);
                    } else if (op[0] === 'pleats') {
                        const ch = this.pleatChains(g, op[1]), N = op[1], tip = k => ch[k % N][ch[k % N].length - 1], root = k => ch[k % N][0];
                        const base = R.tone(g, item.color, op[2]), deep = item.stripe ? R.tone(g, item.stripe, op[3]) : R.tone(g, item.color, op[4]), trim = R.rgb(item.trim || '#f4eee6');
                        for (let i = 0; i < N; i++) {
                            const a0 = root(i), a1 = root(i + 1), t0 = tip(i), t1 = tip(i + 1);
                            // two triangles from the waist: the hem edge t0→t1 and the side t1→a1 are their rims
                            put.tri(a0.x, a0.y, t0.x, t0.y, t1.x, t1.y, i % 2 ? deep : base, sheen);
                            put.tri(a0.x, a0.y, t1.x, t1.y, a1.x, a1.y, i % 2 ? deep : base, sheen);
                        }
                        const tt = R.tex, f = op[5], fr = op[6], hem = R.tone(g, item.color, op[7]); R.tex = 3;
                        for (let i = 0; i < N; i++) {                             // the trim band
                            const t0 = tip(i), a0 = root(i), t1 = tip(i + 1), a1 = root(i + 1);
                            put.capsule(a0.x + (t0.x - a0.x) * f, a0.y + (t0.y - a0.y) * f, a1.x + (t1.x - a1.x) * f, a1.y + (t1.y - a1.y) * f, 0.45, 0.45, trim, 0);
                        }
                        for (let i = 0; i < N; i++) {                             // the frill, then the hem line over it
                            const t0 = tip(i), t1 = tip(i + 1), dx = t1.x - t0.x, dy = t1.y - t0.y;
                            put.ellipse(t0.x + dx * 0.25, t0.y + dy * 0.25, fr, 0, fr, trim, 0); put.ellipse(t0.x + dx * 0.75, t0.y + dy * 0.75, fr, 0, fr, trim, 0);
                        }
                        for (let i = 0; i < N; i++) { const a = tip(i), b = tip(i + 1); put.capsule(a.x, a.y, b.x, b.y, 0.25, 0.25, hem, 0); }
                        R.tex = tt;
                        const [wx, wy, wd] = op[8];
                        put.ellipse(g.hip.x + g.hip.w / 2, 0, wx, 0, wy, R.tone(g, item.color, wd), sheen);
                    } else if (op[0] === 'soles') {
                        const rgb = R.tone(g, item.color, op[1]);
                        for (let i = 0; i < 2; i++) { const [x, y] = g.feet[i]; put.ellipse(x + 2.6, y, 4.2 * g.body.foot, 0, 2.4 * g.body.foot, rgb, 0.4); }
                    } else if (op[0] === 'toe_shine') {
                        for (let i = 0; i < 2; i++) { const [x, y] = g.feet[i]; put.ellipse(x + op[2] + op[3] / 2, y + (i ? 0.45 : -0.45), op[3] / 2, 0, op[4] / 2, [1, 1, 1], 0, 0.18); }
                    } else if (op[0] === 'wrist_rings') {
                        const rgb = R.rgb(item.color || '#e8c27a'), tt = R.tex; R.tex = 3;
                        this.wristRings(g, op, (x, y, Rr, a, k) => {             // a ring seen from above: half an ellipse's outline, one shape
                            const tilt = Math.max(0.28, Math.sqrt(1 - k * k));
                            put.ring(x, y, Math.cos(a) * Rr * tilt, Math.sin(a) * Rr * tilt, Rr, op[3], rgb);
                        }, () => {}, () => {});
                        R.tex = tt;
                    }
                }
            },
        };
