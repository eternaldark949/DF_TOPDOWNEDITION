        /* =====================================================================
           LANDMARK KIT — cheap depth and baked layers for lean-projected buildings
           ---------------------------------------------------------------------
           Every building leans: a point at height z draws at cam + (p − cam)·k(z).
           At any ONE height that is just a uniform scale about the camera, so:

             · flat things (roofs, pads, pools, canopies) are drawn in world
               coordinates under that scale: a few shapes live from cached paths
               and gradients (flat / path / grad), a busy layer baked once into a
               sprite and stamped (sprite / drawSprite);
             · a line drawn round a floor (spandrels, ledges, parapet glints) is
               one world-space Path2D stroked under each floor's scale (rings);
             · vertical members and protrusions (fins, columns, pilasters,
               ledges, plinths, verandas) project a handful of points each and
               go out batched: one fill and one stroke per kind, not per piece.

           The depth vocabulary — fins, ledges, plinths, verandas, columns, sills
           — is the same for every building, so a building only says where they
           go. At night their lit edges catch a rim of the building's own lamp
           colour (colors.accent, the colour its block's street lamps burn), so
           the detail reads in the light of the lamps around it (rim()).

           Everything here draws in the building's base or emissive pass and
           never touches the building's sections, so collision, lamp shadows and
           the block's lamp colours are exactly what they were.
           ===================================================================== */
        const LandmarkKit = {
            /** The lean scale at height z — the same camera as every building's walls. */
            k(z) { const C = leanCamHeight(); return C / (C - Math.min(z, C * 0.86)); },

            /** Put ctx into the plane at scale k: world coordinates land where the lean draws them. */
            plane(ctx, k) { const c = game.camera; ctx.translate(c.x, c.y); ctx.scale(k, k); ctx.translate(-c.x, -c.y); },

            /**
             * A flat layer painted once in world coordinates (bounds x, y, w, h; res px per
             * world px), kept on the owner under `key`. paint(c) draws in world coordinates.
             */
            sprite(owner, key, x, y, w, h, res, paint) {
                const store = owner._lkSprites || (owner._lkSprites = {});
                if (store[key]) return store[key];
                const cv = document.createElement('canvas');
                cv.width = Math.max(1, Math.ceil(w * res)); cv.height = Math.max(1, Math.ceil(h * res));
                const c = cv.getContext('2d');
                c.setTransform(res, 0, 0, res, -x * res, -y * res);
                paint(c);
                LandmarkKit.stats.baked++;
                return (store[key] = { cv, x, y, w, h });
            },

            /** Stamp a sprite in the plane of scale k. */
            drawSprite(ctx, s, k) {
                ctx.save(); LandmarkKit.plane(ctx, k);
                ctx.drawImage(s.cv, s.x, s.y, s.w, s.h);
                ctx.restore();
            },

            /**
             * Draw in the plane of scale k: fn(ctx) paints in world coordinates. For a layer of a
             * few shapes, cache its paths and gradients (path(), grad()) and draw it live here —
             * as cheap as a sprite for the CPU and cheaper to fill. Bake a sprite when a layer
             * has hundreds of marks (gardens, flower beds, paving).
             */
            flat(ctx, k, fn) { ctx.save(); LandmarkKit.plane(ctx, k); fn(ctx); ctx.restore(); },

            /** A Path2D made once per owner and key (world coordinates). */
            path(owner, key, make) {
                const p = owner._lkPaths || (owner._lkPaths = {});
                return p[key] || (p[key] = make(new Path2D()));
            },

            /** One world-space path stroked at each scale in ks (line width stays `width` on screen at k = 1). */
            rings(ctx, path, ks, width, style) {
                ctx.strokeStyle = style;
                for (const k of ks) {
                    ctx.save(); LandmarkKit.plane(ctx, k);
                    ctx.lineWidth = width / k; ctx.stroke(path);
                    ctx.restore();
                }
            },

            /** Project x, y to scale k into out[i], out[i + 1] (no allocation). */
            _p(out, i, x, y, k) { const c = game.camera; out[i] = c.x + (x - c.x) * k; out[i + 1] = c.y + (y - c.y) * k; },

            /**
             * Vertical members standing proud of a wall: at each anchor {x, y, nx, ny} (a point
             * on the wall and its outward normal), a plate `w` wide, `out` in front of the wall,
             * from height z0 to z1. Front faces in one fill, the lit edges in one stroke.
             * lit(a) → 0..1 picks which anchors get the bright edge (e.g. those facing the light).
             */
            fins(ctx, anchors, z0, z1, w, out, face, edge, lit) {
                if (!anchors.length) return;
                const K = LandmarkKit, k0 = K.k(z0), k1 = K.k(z1), q = [0, 0, 0, 0, 0, 0, 0, 0];
                const front = new Path2D(), hi = new Path2D();
                for (const a of anchors) {
                    const tx = -a.ny * w / 2, ty = a.nx * w / 2, fx = a.x + a.nx * out, fy = a.y + a.ny * out;
                    K._p(q, 0, fx - tx, fy - ty, k0); K._p(q, 2, fx + tx, fy + ty, k0);
                    K._p(q, 4, fx + tx, fy + ty, k1); K._p(q, 6, fx - tx, fy - ty, k1);
                    front.moveTo(q[0], q[1]); front.lineTo(q[2], q[3]); front.lineTo(q[4], q[5]); front.lineTo(q[6], q[7]); front.closePath();
                    if (!lit || lit(a) > 0.5) { hi.moveTo(q[2], q[3]); hi.lineTo(q[4], q[5]); }
                }
                ctx.fillStyle = face; ctx.fill(front);
                if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 0.8; ctx.stroke(hi); }
                return hi;
            },

            /**
             * A slab running along wall edges at height z, `out` deep and `th` thick: its top
             * face, its front band and a shadow line under it. edges: [{a:[x,y], b:[x,y], nx, ny}]
             * (the visible ones). Returns the lip path (for the night rim).
             */
            ledge(ctx, edges, z, out, th, top, band, lip) {
                if (!edges.length) return null;
                const K = LandmarkKit, kT = K.k(z), kB = K.k(Math.max(0, z - th)), q = [0, 0, 0, 0, 0, 0, 0, 0];
                const topP = new Path2D(), bandP = new Path2D(), lipP = new Path2D();
                for (const e of edges) {
                    const ax = e.a[0] + e.nx * out, ay = e.a[1] + e.ny * out, bx = e.b[0] + e.nx * out, by = e.b[1] + e.ny * out;
                    // top: wall line to the front line, at z
                    K._p(q, 0, e.a[0], e.a[1], kT); K._p(q, 2, e.b[0], e.b[1], kT); K._p(q, 4, bx, by, kT); K._p(q, 6, ax, ay, kT);
                    topP.moveTo(q[0], q[1]); topP.lineTo(q[2], q[3]); topP.lineTo(q[4], q[5]); topP.lineTo(q[6], q[7]); topP.closePath();
                    lipP.moveTo(q[6], q[7]); lipP.lineTo(q[4], q[5]);
                    // front band: the front line from z − th up to z
                    const tx0 = q[6], ty0 = q[7], tx1 = q[4], ty1 = q[5];
                    K._p(q, 0, ax, ay, kB); K._p(q, 2, bx, by, kB);
                    bandP.moveTo(q[0], q[1]); bandP.lineTo(q[2], q[3]); bandP.lineTo(tx1, ty1); bandP.lineTo(tx0, ty0); bandP.closePath();
                }
                ctx.fillStyle = band; ctx.fill(bandP);
                ctx.fillStyle = top; ctx.fill(topP);
                if (lip) { ctx.strokeStyle = lip; ctx.lineWidth = 0.9; ctx.stroke(lipP); }
                return lipP;
            },

            /**
             * A veranda: a ledge `out` deep with a rail along its front — posts every `step`
             * px and a handrail `rh` above the slab. Returns the rail path (for the night rim).
             */
            veranda(ctx, edges, z, out, step, rh, slabTop, slabBand, rail) {
                const K = LandmarkKit;
                K.ledge(ctx, edges, z, out, 2, slabTop, slabBand, null);
                const kz = K.k(z), kr = K.k(z + rh), q = [0, 0, 0, 0], railP = new Path2D(), posts = new Path2D();
                for (const e of edges) {
                    const ax = e.a[0] + e.nx * (out - 1), ay = e.a[1] + e.ny * (out - 1), bx = e.b[0] + e.nx * (out - 1), by = e.b[1] + e.ny * (out - 1);
                    const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / step));
                    K._p(q, 0, ax, ay, kr); K._p(q, 2, bx, by, kr); railP.moveTo(q[0], q[1]); railP.lineTo(q[2], q[3]);
                    for (let i = 0; i <= n; i++) {
                        const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
                        K._p(q, 0, x, y, kz); K._p(q, 2, x, y, kr); posts.moveTo(q[0], q[1]); posts.lineTo(q[2], q[3]);
                    }
                }
                ctx.strokeStyle = rail; ctx.lineWidth = 0.7; ctx.stroke(posts);
                ctx.lineWidth = 1.2; ctx.stroke(railP);
                return railP;
            },

            /** Round columns from z0 to z1: a shaded shaft and a capital, all in two fills. */
            columns(ctx, pts, r, z0, z1, shaft, cap) {
                const K = LandmarkKit, k0 = K.k(z0), k1 = K.k(z1), c = game.camera, q = [0, 0, 0, 0];
                const shafts = new Path2D(), caps = new Path2D();
                for (const [x, y] of pts) {
                    K._p(q, 0, x, y, k0); K._p(q, 2, x, y, k1);
                    const vx = q[2] - q[0], vy = q[3] - q[1], L = Math.hypot(vx, vy) || 1, px = -vy / L, py = vx / L;
                    shafts.moveTo(q[0] - px * r * k0, q[1] - py * r * k0); shafts.lineTo(q[2] - px * r * k1, q[3] - py * r * k1);
                    shafts.lineTo(q[2] + px * r * k1, q[3] + py * r * k1); shafts.lineTo(q[0] + px * r * k0, q[1] + py * r * k0); shafts.closePath();
                    caps.moveTo(q[2] + r * 1.4 * k1, q[3]); caps.arc(q[2], q[3], r * 1.4 * k1, 0, Math.PI * 2);
                }
                ctx.fillStyle = shaft; ctx.fill(shafts);
                ctx.fillStyle = cap; ctx.fill(caps);
                return caps;
            },

            /**
             * Window sills: a short lip under each window, `out` proud of the wall. wins:
             * [{x0, y0, x1, y1, nx, ny, z}] (the window's bottom edge on the wall, and its
             * height). One stroke for the lips and one for their shadows.
             */
            sills(ctx, wins, out, lip, shade) {
                if (!wins.length) return null;
                const K = LandmarkKit, q = [0, 0, 0, 0], lipP = new Path2D(), shP = new Path2D();
                for (const w of wins) {
                    const k = K.k(w.z), ks = K.k(Math.max(0, w.z - 1.5));
                    const ax = w.x0 + w.nx * out, ay = w.y0 + w.ny * out, bx = w.x1 + w.nx * out, by = w.y1 + w.ny * out;
                    K._p(q, 0, ax, ay, k); K._p(q, 2, bx, by, k); lipP.moveTo(q[0], q[1]); lipP.lineTo(q[2], q[3]);
                    K._p(q, 0, ax, ay, ks); K._p(q, 2, bx, by, ks); shP.moveTo(q[0], q[1]); shP.lineTo(q[2], q[3]);
                }
                ctx.lineWidth = 1.2; ctx.strokeStyle = shade; ctx.stroke(shP);
                ctx.lineWidth = 1; ctx.strokeStyle = lip; ctx.stroke(lipP);
                return lipP;
            },

            /**
             * The night rim: how strongly the building's details catch its lamp colour.
             * rgb 'r, g, b' of colors.accent (the colour its block's street lamps burn), and a
             * = 0 by day, rising with the dark once the lamps are on.
             */
            rim(owner, dark) {
                if (!owner._lkRim) owner._lkRim = hexToRgb((owner.colors && owner.colors.accent) || '#ffcf8a');
                const on = typeof game !== 'undefined' && game.dayCycle ? (game.dayCycle().lampsOn ? 1 : 0) : 1;
                return { rgb: owner._lkRim, a: on * Math.max(0, Math.min(1, (dark - 0.15) * 1.6)) };
            },

            /** A gradient made once per owner and key (world-space gradients, drawn under plane()/flat()). */
            grad(owner, key, make) {
                const g = owner._lkGrads || (owner._lkGrads = {});
                return g[key] || (g[key] = make());
            },

            stats: { baked: 0 }
        };
