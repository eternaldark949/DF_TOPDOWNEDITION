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
                    }
                }
            },

            /** Draw a garment as WebGL shapes. `put` places them: put.capsule(x1, y1, x2, y2, r1, r2, rgb, sheen) and
             *  put.ellipse(cx, cy, axx, axy, rb, rgb, sheen), in the same frame as the Canvas version; R the renderer. */
            gl(R, g, packet, item, put, sheen = 0) {
                for (const op of packet) {
                    if (op[0] === 'band') {
                        const [x1, y1, x2, y2] = this.band(g, op[1], op[2], op[3]);
                        put.capsule(x1, y1, x2, y2, op[4], op[4], R.rgb(g.darken(item.color, op[5])), sheen);
                    } else if (op[0] === 'hips') {
                        const B = g.body, grow = op[1];                          // the hip outline, as its ellipse
                        put.ellipse((B.hf + B.hb) / 2 + B.cleft * 0.25, 0, (B.hf - B.hb) / 2 + grow, 0, B.hw + grow, R.rgb(g.darken(item.color, op[2])), sheen);
                    } else if (op[0] === 'seam') {
                        const rgb = R.rgb(g.darken(item.color, op[1])), pts = op[3].map(p => this.point(g, p)), r = op[2] / 2, t = R.tex;
                        R.tex = 3;                                               // a stitched line: no grain, no ink edge
                        for (let k = 1; k < pts.length; k++) put.capsule(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], r, r, rgb, 0);
                        R.tex = t;
                    }
                }
            },
        };
