        /* =====================================================================
           ENTRANCE LAMPS — 3D lamps at the doors of the tiered buildings
           ---------------------------------------------------------------------
           The stock building ringed its roof with flat round lamps (BuildingV2
           _generateLights: one every 200 px round every edge). On the tiered
           kit those read as dots stuck on the roofline. Here each building
           says instead which lamps stand at its entrance, in the building's own
           frame (front at +y, as its tiers are authored; facing 'N' turns them
           round with the plan), and they're built the Silver Queen's way: real
           pieces projected with the building's lean (_tkP / _tkK), drawn after
           its tiers in drawTop, their glass and halo again in the glow pass,
           and their light on the street as light-only LampEntities (no flat
           fixture drawn).

           A spec: { kind, x, y (plan px), z (design units: the lamp's height),
           out (how far it stands off the wall, px), rgb (the glass's light,
           'r, g, b'), light: [radius, '#hex'] (its pool on the street, which
           sits `out + 18` px in front unless light[2] gives the offset) }.

           Kinds, one per vibe:
             lantern    a wrought-iron carriage lantern on a scroll bracket (Cozy Cafe)
             gooseneck  a steel barn shade on a curved arm (Torque Auto's hall)
             sconce     a slim up-and-down cylinder sconce (Torque's showroom)
             pylon      a frosted light pylon on the pavement, a lit cap (Dr. Yin's)
             crystal    a cut crystal glowing on a stone plinth (Neural Systems)
             carnival   a brass post with a cluster of globes (Biggs Park)
             bulkhead   a caged bulkhead hung from a canopy's edge (the warehouse)
           ===================================================================== */
        const EntranceLamps = {
            /** The lamps' light on the street: light-only lamps (the pieces themselves are drawn here) */
            lights(b) {
                for (const s of b._entLamps || []) {
                    if (!s.light) continue;
                    const off = s.light[2] ?? (s.out || 0) + 18, [x, y] = EntranceLamps._w(b, s.x, s.y + off);
                    const l = new LampEntity({ x, y, lampType: 3, color: s.light[1], lightRadius: s.light[0] });
                    l.visible = false; l.keepColor = true; b.attachedLights.push(l);
                }
            },

            /** Plan → world, and the front's normal in the world (y only: the kit's buildings face S or N) */
            _w(b, x, y) { const [px, py] = b._tkLocal ? b._tkLocal(x, y) : [x, y]; return [b.x + px, b.y + py]; },
            _n(b) { return b.facing === 'N' ? -1 : 1; },

            /** A box from (x0, y0) to (x1, y1) world, z0..z1 design units: the faces turned to the camera, then the cap */
            prism(ctx, b, x0, y0, x1, y1, z0, z1, wall, cap, shade = true) {
                const cam = b.cam || game.camera;
                const faces = [];
                if (cam.y > y1) faces.push([x0, y1, x1, y1, 0]); if (cam.y < y0) faces.push([x1, y0, x0, y0, 0.3]);
                if (cam.x > x1) faces.push([x1, y1, x1, y0, 0.15]); if (cam.x < x0) faces.push([x0, y0, x0, y1, 0.15]);
                for (const [ax, ay, bx, by, s] of faces) {
                    const a = b._tkP(ax, ay, z0), q = b._tkP(bx, by, z0), c2 = b._tkP(bx, by, z1), d2 = b._tkP(ax, ay, z1);
                    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(q[0], q[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(d2[0], d2[1]); ctx.closePath();
                    ctx.fillStyle = wall; ctx.fill();
                    if (shade && s) { ctx.fillStyle = `rgba(0, 0, 0, ${s})`; ctx.fill(); }
                }
                if (cap) {
                    ctx.beginPath(); [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(([x, y], i) => { const p = b._tkP(x, y, z1); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
                    ctx.fillStyle = cap; ctx.fill();
                }
            },
            /** A line through points [x, y, z] (world x, y; design z), w px wide at the street */
            line(ctx, b, pts, w, col) {
                ctx.beginPath(); pts.forEach(([x, y, z], i) => { const p = b._tkP(x, y, z); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
                ctx.strokeStyle = col; ctx.lineWidth = w * b._tkK(pts[pts.length - 1][2]); ctx.lineCap = 'round'; ctx.stroke();
            },
            /** A disc (r px) lying at height z */
            disc(ctx, b, x, y, z, r, fill) { const p = b._tkP(x, y, z), k = b._tkK(z); ctx.beginPath(); ctx.arc(p[0], p[1], r * k, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); },
            /** A ball (r px) at height z: a lit side away from the camera's dark side */
            ball(ctx, b, x, y, z, r, inner, outer) {
                const p = b._tkP(x, y, z), k = b._tkK(z), R = r * k, g = ctx.createRadialGradient(p[0] - R * 0.35, p[1] - R * 0.35, R * 0.1, p[0], p[1], R);
                g.addColorStop(0, inner); g.addColorStop(1, outer); ctx.beginPath(); ctx.arc(p[0], p[1], R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
            },
            /** A halo at height z */
            glow(ctx, b, x, y, z, r, rgb, a) { const p = b._tkP(x, y, z); glowA(ctx, p[0], p[1], r * b._tkK(z) / Math.sqrt(b.m || 1), rgb, a); },

            /**
             * The pieces are drawn `size` (default SIZE) times as wide as the numbers in KINDS and `zsize` times as tall (a
             * wall lamp 1.5, one standing on the street 1: its height is its own), about the lamp's anchor: its foot on the
             * street (GROUND kinds) or its fixing on the wall at z (the rest; a hung one: at `top`), so a lamp reads beside
             * the humanoid. A view of the building that does that scaling inside its lean; m for the halos.
             */
            SIZE: 2.2,
            GROUND: { pylon: 1, crystal: 1, carnival: 1 },
            _view(b, s, ax, ay, cam) {
                const g = EntranceLamps.GROUND[s.kind], m = s.size || EntranceLamps.SIZE, mz = s.zsize || (g ? 1 : 1.5), az = g ? 0 : (s.top ?? s.z);
                return {
                    _tkP: (x, y, z) => b._tkP(ax + (x - ax) * m, ay + (y - ay) * m, az + (z - az) * mz),
                    _tkK: (z) => b._tkK(az + (z - az) * mz) * m,
                    cam: { x: ax + (cam.x - ax) / m, y: ay + (cam.y - ay) / m }, m
                };
            },

            /** Every lamp: lit = the glow pass (additive, at strength g) */
            draw(ctx, b, lit, g = 1) {
                const L = b._entLamps; if (!L || !L.length) return;
                if (_zoomLOD >= 3 && !lit) return;                                      // (zoomed right out: smaller than a pixel)
                ctx.save();
                if (lit) ctx.globalCompositeOperation = 'lighter';
                const n = EntranceLamps._n(b), cam = game.camera;
                for (const s of L) {
                    const [x, y] = EntranceLamps._w(b, s.x, s.y), f = EntranceLamps.KINDS[s.kind];
                    if (f) f(ctx, EntranceLamps._view(b, s, x, y, cam), s, x, y, n, lit, g);
                }
                ctx.restore();
            },

            KINDS: {
                /** Wrought iron: a scroll bracket off the wall, a tapered lantern of amber glass, a little roof and finial */
                lantern(ctx, b, s, x, y, n, lit, g) {
                    const E = EntranceLamps, z = s.z, ly = y + n * (s.out || 6), rgb = s.rgb || '255, 190, 110';
                    if (lit) {
                        E.glow(ctx, b, x, y + n * 2, z - 2, 26, rgb, 0.35 * g);                           // the wash on the brick
                        E.glow(ctx, b, x, ly, z - 1.5, 13, rgb, 0.85 * g);
                        E.prism(ctx, b, x - 1.6, ly - 1.6, x + 1.6, ly + 1.6, z - 3.4, z + 0.2, `rgba(255, 214, 150, ${0.9 * g})`, null, false);
                        return;
                    }
                    E.line(ctx, b, [[x, y, z + 1.2], [x, y + n * (s.out || 6) * 0.6, z + 1.8], [x, ly, z + 1.2]], 0.9, '#17110c');   // the bracket
                    E.line(ctx, b, [[x, y, z - 1.5], [x, y + n * 2.5, z - 0.3], [x, y + n * 3.2, z + 1.4]], 0.6, '#17110c');           // its scroll
                    E.line(ctx, b, [[x - 2.2, y, z - 2.5], [x + 2.2, y, z - 2.5]], 1.4, '#1d1610');                                  // the wall plate
                    E.prism(ctx, b, x - 2, ly - 2, x + 2, ly + 2, z - 4, z - 3.4, '#1a140e', '#2b2118');                              // the base
                    E.prism(ctx, b, x - 1.7, ly - 1.7, x + 1.7, ly + 1.7, z - 3.4, z + 0.2, '#9a6a32', null);                         // the glass
                    E.line(ctx, b, [[x - 1.7, ly + 1.7 * n, z - 3.4], [x - 1.7, ly + 1.7 * n, z + 0.2]], 0.5, '#17110c');              // the frame's corners
                    E.line(ctx, b, [[x + 1.7, ly + 1.7 * n, z - 3.4], [x + 1.7, ly + 1.7 * n, z + 0.2]], 0.5, '#17110c');
                    E.prism(ctx, b, x - 2.3, ly - 2.3, x + 2.3, ly + 2.3, z + 0.2, z + 0.9, '#1a140e', '#33271c');                    // the roof
                    E.prism(ctx, b, x - 1.1, ly - 1.1, x + 1.1, ly + 1.1, z + 0.9, z + 1.6, '#1a140e', '#3c2e20');
                    E.disc(ctx, b, x, ly, z + 2.1, 0.7, '#b48a4a');                                                                   // the finial
                },

                /** A barn shade: a steel arm curving out and over, the shade's dome, a bulb under it lighting the wall */
                gooseneck(ctx, b, s, x, y, n, lit, g) {
                    const E = EntranceLamps, z = s.z, out = s.out || 8, hy = y + n * out, rgb = s.rgb || '255, 170, 80';
                    if (lit) {
                        E.glow(ctx, b, x, y + n * 1.5, z - 5, 34, rgb, 0.4 * g);                          // the cone on the wall below
                        E.glow(ctx, b, x, hy, z - 0.8, 10, rgb, 0.9 * g);
                        E.disc(ctx, b, x, hy + n * 0.6, z - 0.9, 3.4, `rgba(255, 196, 120, ${0.55 * g})`);  // the shade's lit rim, seen past its edge
                        return;
                    }
                    E.line(ctx, b, [[x, y, z - 2.5], [x, y + n * 2, z + 1.2], [x, y + n * out * 0.55, z + 2.4], [x, hy - n * 1.5, z + 1.6], [x, hy, z + 0.4]], 0.9, '#2b2d33');
                    E.line(ctx, b, [[x - 1.8, y, z - 2.5], [x + 1.8, y, z - 2.5]], 1.6, '#16171b');                                  // the wall plate
                    E.ball(ctx, b, x, hy, z, 4.2, s.shadeHi || '#6a6f78', s.shadeLo || '#1d1f24');                                    // the shade's dome
                    E.disc(ctx, b, x, hy, z + 0.6, 1.2, '#2b2d33');                                                                   // its socket
                    if (s.band) E.line(ctx, b, [[x - 3.6, hy + n * 1.6, z - 0.4], [x + 3.6, hy + n * 1.6, z - 0.4]], 0.5, s.band);    // the enamel band
                },

                /** A slim cylinder on the wall, light out of both ends */
                sconce(ctx, b, s, x, y, n, lit, g) {
                    const E = EntranceLamps, z = s.z, cy = y + n * (s.out || 2.5), rgb = s.rgb || '255, 200, 170';
                    if (lit) {
                        E.glow(ctx, b, x, y + n * 0.5, z + 5, 18, rgb, 0.4 * g); E.glow(ctx, b, x, y + n * 0.5, z - 5, 18, rgb, 0.4 * g);
                        E.glow(ctx, b, x, cy, z + 2.6, 6, rgb, 0.9 * g); E.glow(ctx, b, x, cy, z - 2.6, 6, rgb, 0.7 * g);
                        return;
                    }
                    E.line(ctx, b, [[x, y, z], [x, cy, z]], 1.2, '#2a2a30');
                    E.prism(ctx, b, x - 1.5, cy - 1.5, x + 1.5, cy + 1.5, z - 2.6, z + 2.6, s.metal || '#b88a76', s.metalHi || '#f4c4ae');
                    E.disc(ctx, b, x, cy, z + 2.65, 0.9, '#3a2c28');
                },

                /** A frosted pylon on the pavement: a dark foot, a tall glass body with a lit seam, a cap that glows */
                pylon(ctx, b, s, x, y, n, lit, g) {
                    const E = EntranceLamps, z = s.z, rgb = s.rgb || '120, 255, 240', w = 2.2;
                    if (lit) {
                        E.glow(ctx, b, x, y, 2, 30, rgb, 0.35 * g);                                       // its pool round the foot
                        E.prism(ctx, b, x - w + 0.5, y - w + 0.5, x + w - 0.5, y + w - 0.5, 2, z - 1, `rgba(${rgb}, ${0.45 * g})`, null, false);
                        E.glow(ctx, b, x, y, z - 0.5, 12, rgb, 0.9 * g);
                        E.disc(ctx, b, x, y, z + 0.05, w * 0.7, `rgba(${rgb}, ${0.9 * g})`);
                        E.line(ctx, b, [[x - w + 0.4, y + n * w, 2.2], [x - w + 0.4, y + n * w, z - 1.2]], 0.6, `rgba(220, 255, 255, ${0.9 * g})`);
                        return;
                    }
                    E.prism(ctx, b, x - w - 0.6, y - w - 0.6, x + w + 0.6, y + w + 0.6, 0, 2, '#0b1616', '#142424');
                    E.prism(ctx, b, x - w, y - w, x + w, y + w, 2, z - 1, s.glass || '#5f8a88', null);
                    E.line(ctx, b, [[x - w + 0.4, y + n * w, 2.2], [x - w + 0.4, y + n * w, z - 1.2]], 0.6, '#9fe8e0');               // the seam
                    E.prism(ctx, b, x - w - 0.4, y - w - 0.4, x + w + 0.4, y + w + 0.4, z - 1, z, '#0b1616', '#0f1e1e');
                    E.disc(ctx, b, x, y, z + 0.05, w * 0.7, s.cap || '#86b0ad');                                                       // the lens in its cap
                },

                /** A cut crystal on a stone plinth: a six-sided point, its facets shaded round, light in its heart */
                crystal(ctx, b, s, x, y, n, lit, g) {
                    const E = EntranceLamps, z = s.z, rgb = s.rgb || '150, 200, 255', z0 = 6.5, R = 3.6, cam = b.cam;
                    const ring = Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3 + Math.PI / 6; return [x + Math.cos(a) * R, y + Math.sin(a) * R * 0.8]; });
                    if (lit) {
                        E.glow(ctx, b, x, y, z0 + 1, 34, rgb, 0.3 * g);
                        E.glow(ctx, b, x, y, (z0 + z) / 2, 14, rgb, 0.8 * g);
                        E.glow(ctx, b, x, y, z, 6, '235, 245, 255', 0.9 * g);
                        return;
                    }
                    E.prism(ctx, b, x - 3.8, y - 3.8, x + 3.8, y + 3.8, 0, 1.5, '#3a4656', '#526275');                                // the step
                    E.prism(ctx, b, x - 3, y - 3, x + 3, y + 3, 1.5, z0, '#14243c', '#1d2f4a');                                        // the plinth
                    E.line(ctx, b, [[x - 3, y + 3 * n, z0 - 1], [x + 3, y + 3 * n, z0 - 1]], 0.5, '#c1a980');                          // its gold band
                    // the facets: from the ring's foot (just above the plinth) to the point, the far ones first
                    const foot = b._tkP(x, y, z0 + 0.4), tip = b._tkP(x, y, z), mid = z0 + (z - z0) * 0.32, cols = ['#2c5f99', '#4b80bb', '#1c3f6c', '#0f2547', '#3a6aa4', '#6d9cd0'];
                    const fs = ring.map((p, i) => { const q = ring[(i + 1) % 6], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; return { i, p, q, d: -Math.hypot(mx - cam.x, my - cam.y) }; }).sort((a, c) => a.d - c.d);
                    for (const f of fs) {
                        const a = b._tkP(f.p[0], f.p[1], mid), c = b._tkP(f.q[0], f.q[1], mid);
                        ctx.beginPath(); ctx.moveTo(foot[0], foot[1]); ctx.lineTo(a[0], a[1]); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(c[0], c[1]); ctx.closePath();
                        ctx.fillStyle = cols[f.i]; ctx.fill(); ctx.strokeStyle = 'rgba(190, 216, 238, 0.55)'; ctx.lineWidth = 0.4 * b._tkK(mid); ctx.stroke();
                    }
                },

                /** A brass post, a ring of arms with a globe on each and one on top, a striped finial over that */
                carnival(ctx, b, s, x, y, n, lit, g) {
                    const E = EntranceLamps, z = s.z, rgb = s.rgb || '255, 214, 150', arms = s.arms ?? 2, aw = 4.6;
                    const globes = [[x, y, z + 1.6]]; if (arms >= 2) globes.push([x - aw, y, z - 1], [x + aw, y, z - 1]);
                    if (lit) {
                        E.glow(ctx, b, x, y, z - 2, 40, rgb, 0.3 * g);
                        for (const [gx, gy, gz] of globes) { E.glow(ctx, b, gx, gy, gz, 9, rgb, 0.85 * g); E.ball(ctx, b, gx, gy, gz, 1.9, `rgba(255, 250, 230, ${g})`, `rgba(255, 190, 110, ${0.5 * g})`); }
                        return;
                    }
                    E.prism(ctx, b, x - 2.4, y - 2.4, x + 2.4, y + 2.4, 0, 1.6, '#3a1820', '#692735');                                // the plinth
                    E.line(ctx, b, [[x, y, 1.6], [x, y, z]], 1.4, '#9a7444');                                                          // the post
                    E.line(ctx, b, [[x, y, z * 0.35], [x, y, z * 0.35 + 0.4]], 2.4, '#d4b07a');                                        // its collars
                    E.line(ctx, b, [[x, y, z * 0.7], [x, y, z * 0.7 + 0.4]], 2.2, '#d4b07a');
                    if (arms >= 2) E.line(ctx, b, [[x - aw, y, z - 2.2], [x - aw * 0.5, y, z - 0.4], [x, y, z - 0.6], [x + aw * 0.5, y, z - 0.4], [x + aw, y, z - 2.2]], 0.8, '#bc945b');
                    for (const [gx, gy, gz] of globes) E.ball(ctx, b, gx, gy, gz, 1.9, '#f6ead0', '#a88d6a');
                    E.disc(ctx, b, x, y, z + 3.8, 1.2, '#e5a29a'); E.disc(ctx, b, x, y, z + 4.3, 0.7, '#ead8b1');                     // the finial
                },

                /** Hung from a canopy's edge on a rod: a cast box with a wire cage over sodium glass */
                bulkhead(ctx, b, s, x, y, n, lit, g) {
                    const E = EntranceLamps, z = s.z, rgb = s.rgb || '255, 200, 110', top = s.top ?? z + 3;
                    if (lit) {
                        E.glow(ctx, b, x, y, z - 2, 44, rgb, 0.35 * g);
                        E.glow(ctx, b, x, y, z - 1, 10, rgb, 0.9 * g);
                        E.prism(ctx, b, x - 2.6, y - 1.6, x + 2.6, y + 1.6, z - 1.8, z - 0.4, `rgba(255, 210, 130, ${0.85 * g})`, null, false);
                        return;
                    }
                    E.line(ctx, b, [[x, y, top], [x, y, z]], 0.7, '#1b1c20');                                                         // the rod
                    E.prism(ctx, b, x - 3, y - 2, x + 3, y + 2, z - 0.4, z + 0.4, '#2c2e33', '#4a4c52');                              // the housing
                    E.prism(ctx, b, x - 2.6, y - 1.6, x + 2.6, y + 1.6, z - 1.8, z - 0.4, '#a7864a', null);                           // the glass
                    for (const dx of [-1.3, 0, 1.3]) E.line(ctx, b, [[x + dx, y + 1.6 * n, z - 1.8], [x + dx, y + 1.6 * n, z - 0.4]], 0.35, '#1b1c20');   // the cage
                    E.line(ctx, b, [[x - 2.6, y + 1.6 * n, z - 1.1], [x + 2.6, y + 1.6 * n, z - 1.1]], 0.35, '#1b1c20');
                }
            }
        };
