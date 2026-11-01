        /* =====================================================================
           TIERED KIT — buildings of several heights, on any plan
           ---------------------------------------------------------------------
           A stock building is one prism: its sections share one height, its walls
           run from the street to one roofline. A TieredBuilding is a stack of
           tiers, each a prism of its own: any polygon plan (rectangles, bays,
           facets), its own base z0 and top z1. A tower can rise behind a low
           podium, a wing stop at eight floors, a turret climb out of the roof, a
           bay hang out of the third floor.

             · Walls: each tier edge is a face. Where it stands against a lower
               tier (collinear, back to back) only the part above that tier's
               roof shows; against a taller one it's hidden (_tkFaces).
             · Art: each tier's walls are painted as ONE strip unrolled round its
               plan (tier.paint), so carving runs across the corners; each face
               maps its slice onto its leaning quad, tiled in z (the lean is a
               perspective).
             · Ledges (cornices, string courses, sills of the bays) are real:
               projected slabs mitred round the plan (tier.ledges).
             · Roofs: each tier's in its own plane, at its own height, baked once
               (tier.roof); what stands on it (domes, chimneys) draws live
               (tier.top).
             · Order: within the building, farthest group first, then low to high
               (a tier on another draws after it), so a tower's walls cover the
               podium's roof behind it and the podium's front stays over the
               tower's foot.
             · The glow pass and the sun's shadows go by the tiers too
               (_glowOccluders, _sunShadowHulls).
             · Speed: the art and roofs are baked once; what depends on where the
               camera stands (the draw order, the faces turned to it, each tier's
               outline on screen, each face's grid of tile corners) is worked out
               once per vantage (_tkView) and shared by the walls, the glow, the
               other buildings' glow clips and the mirrors; it's kept while the
               camera stands still. Tiles off the screen are skipped. The night
               light isn't drawn at all in full daylight.
             · Level of detail: each face gets only the tiles it needs for its
               error on screen to stay under a px or two (_tkTiles: fewer zoomed
               out, far off, or where it leans less), never more than the stock
               _TK_TILE and never worse than those; zoomed right out the ledges'
               lips and the contact shadows go. TierKit.LOD = false: as before.

           The plan is laid out in the building's own frame with its front at the
           bottom (+y); facing 'N' turns it round (a rotation, so faces keep their
           handedness). Collision is the bounding rectangle of each tier that
           stands on the street (z0 = 0).
           ===================================================================== */
        const TierKit = {
            /** Convex hull (monotone chain) of [x, y] points. */
            hull(pts) {
                pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
                const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
                const lo = [], up = [];
                for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
                for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
                return lo.slice(0, -1).concat(up.slice(0, -1));
            },
            rect(x, y, w, h) { return [[x, y], [x, y + h], [x + w, y + h], [x + w, y]]; },
            /**
             * A bay standing out of a wall at y = wy (the wall runs along x, the bay out toward +y): cheeks `cheek` long
             * from x0 and x1, then a half-ellipse `depth` deep in n facets. Open at the wall (the tier closes it).
             */
            bay(x0, x1, wy, cheek, depth, n) {
                const cx = (x0 + x1) / 2, a = (x1 - x0) / 2, ey = wy + cheek, pts = [[x0, wy], [x0, ey]];
                for (let i = 1; i < n; i++) { const t = Math.PI - i * Math.PI / n; pts.push([cx + a * Math.cos(t), ey + depth * Math.sin(t)]); }
                pts.push([x1, ey], [x1, wy]);
                return pts;
            },
            /** A polygon's signed area (negative: its edges' left normals (-dy, dx) point out). */
            LOD: true,                 // tiles sized by their error on screen (_tkTiles); false: always _TK_TILE (to compare)
            area(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
        };

        const _TK_TILE = [40, 14];   // a face is mapped in tiles at most this wide and tall (world px): each an affine piece of its perspective quad (tier.tile overrides)
        // Level of detail: a face gets only as many tiles as it needs for its tiles' error on screen to stay under this many px
        // (by _zoomLOD: full, reduced, minimal). Zoomed out, far off or low (less lean), that's fewer tiles; never more than _TK_TILE gives.
        const _TK_ERR = [0.75, 1.25, 2];

        class TieredBuilding extends BuildingV2 {
            /**
             * config.plan: { W, D } the frame; config.tiers: [{ id, poly | rect: [x, y, w, h], z0, z1, on (the tier it stands on), fill (the wall's colour under its art), paint(d, l, t, H, L),
             * S (art px per world px), roof(c, emissive, t), top(ctx, emissive, t), ledges: [{ z, out, th, top, band, lip }],
             * shade: [r, g, b] (the ledge fronts' and walls' shadow colour) }]. config.hero: lean multiplier.
             */
            constructor(config) {
                const P = config.plan, N = config.facing === 'N';
                const toW = (x, y) => N ? [P.W - x, P.D - y] : [x, y];
                const sections = [];
                for (const t of config.tiers) {
                    if (t.z0 > 0 || t.solid === false) continue;
                    const pts = (t.poly || TierKit.rect(...t.rect)).map(([x, y]) => toW(x, y));
                    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys);
                    sections.push({ x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 });
                }
                const top = Math.max(...config.tiers.map(t => t.z1));
                super({ ...config, sections, floors: Math.min(CONFIG.BUILDINGS.MAX_FLOORS, Math.ceil(top / CONFIG.BUILDINGS.FLOOR_HEIGHT)) });
                this.isTiered = true;
                // Its box (culling, the depth order, the glow pass) runs from its corner to the far side of every tier, overhangs too
                let mx = 0, my = 0;
                for (const t of config.tiers) for (const [x, y] of (t.poly || TierKit.rect(...t.rect))) { const [wx, wy] = toW(x, y); mx = Math.max(mx, wx); my = Math.max(my, wy); }
                this.w = Math.max(this.localBounds.x + this.localBounds.w, mx); this.h = Math.max(this.localBounds.y + this.localBounds.h, my);
                this.hero = config.hero || 1;
                this._tkLocal = toW;
                this._tkDefs = config.tiers;
                this.facing = config.facing === 'N' ? 'N' : 'S';
                // The render query reckons a building's reach by its crown, at the street's lean: one leaning `hero` times
                // as hard reaches at least as far as one hero times as tall (k is convex in z)
                this.crownZ = top * this.hero;
            }

            /** The lean scale at height z, `hero` times the street's. */
            _tkK(z) { if (!CONFIG.BUILDINGS.LEAN) return 1; const C = leanCamHeight(); return 1 + (C / (C - Math.min(z, C * 0.86)) - 1) * this.hero; }
            _tkP(x, y, z) { const k = this._tkK(z), c = game.camera; return [c.x + (x - c.x) * k, c.y + (y - c.y) * k]; }
            _hullK() { return Math.max(super._hullK(), this._tkK(this.crownZ / this.hero + CONFIG.CULLING.LEAN_EXTRA * CONFIG.BUILDINGS.FLOOR_HEIGHT)); }

            /** The tiers in world coordinates, their faces (exposed by height), and the order groups. Built once per position. */
            _tkGeo() {
                if (this._tk && this._tk.x === this.x && this._tk.y === this.y) return this._tk;
                const tiers = this._tkDefs.map((d, i) => {
                    let poly = (d.poly || TierKit.rect(...d.rect)).map(([x, y]) => { const [wx, wy] = this._tkLocal(x, y); return [this.x + wx, this.y + wy]; });
                    if (TierKit.area(poly) > 0) poly = poly.slice().reverse();
                    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
                    return { ...d, i, poly, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], faces: [] };
                });
                const byId = {}; for (const t of tiers) byId[t.id] = t;
                for (const t of tiers) t.support = t.on ? byId[t.on] : null;
                for (const t of tiers) { let r = t; while (r.support) r = r.support; t.root = r; }
                // the faces: each edge, less what stands against it (collinear, back to back) as high or higher
                const faces = [];
                for (const t of tiers) {
                    let u = 0;
                    const n = t.poly.length;
                    t.mitre = [];
                    for (let i = 0; i < n; i++) {
                        const a = t.poly[i], b = t.poly[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
                        if (L < 0.5) { t.mitre.push(null); continue; }
                        const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
                        // the wall's z range at each stretch along it: cuts where other tiers' edges begin and end
                        const cuts = [0, 1], against = [];
                        for (const o of tiers) {
                            if (o === t || o.z0 > t.z0 + 0.5) continue;
                            for (let j = 0; j < o.poly.length; j++) {
                                const p = o.poly[j], q = o.poly[(j + 1) % o.poly.length], Lo = Math.hypot(q[0] - p[0], q[1] - p[1]);
                                if (Lo < 0.5) continue;
                                const onx = -(q[1] - p[1]) / Lo, ony = (q[0] - p[0]) / Lo;
                                if (onx * nx + ony * ny > -0.999) continue;                                // back to back only
                                if (Math.abs((p[0] - a[0]) * nx + (p[1] - a[1]) * ny) > 0.5) continue;     // on the same line
                                const s = (x, y) => ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / (L * L);
                                const s0 = Math.max(0, Math.min(s(...p), s(...q))), s1 = Math.min(1, Math.max(s(...p), s(...q)));
                                if (s1 - s0 < 1e-4) continue;
                                cuts.push(s0, s1); against.push([s0, s1, o.z1]);
                            }
                        }
                        cuts.sort((x, y) => x - y);
                        for (let c = 0; c < cuts.length - 1; c++) {
                            const s0 = cuts[c], s1 = cuts[c + 1];
                            if (s1 - s0 < 1e-4) continue;
                            const m = (s0 + s1) / 2;
                            let z0 = t.z0;
                            for (const [g0, g1, oz] of against) if (m > g0 && m < g1) z0 = Math.max(z0, oz);
                            if (z0 >= t.z1 - 0.5) continue;
                            const f = { side: 'C', section: 0, tier: t, edge: i, x1: a[0] + (b[0] - a[0]) * s0, y1: a[1] + (b[1] - a[1]) * s0, x2: a[0] + (b[0] - a[0]) * s1, y2: a[1] + (b[1] - a[1]) * s1,
                                nx, ny, L: L * (s1 - s0), z0, z1: t.z1, u0: u + L * s0, atA: s0 < 1e-4, atB: s1 > 1 - 1e-4 };
                            t.faces.push(f); faces.push(f);
                        }
                        t.mitre.push({ nx, ny, u0: u, L, hidden: !t.faces.some(f => f.edge === i) });
                        u += L;
                    }
                    t.perimeter = u;
                }
                return (this._tk = { x: this.x, y: this.y, tiers, faces });
            }
            _leanFaces() { return this._tkGeo().faces; }

            /** A tier's mitred offset of polygon vertex i, `out` from the wall. */
            _tkMitre(t, i, out) {
                const n = t.poly.length, v = t.poly[i];
                let ia = (i - 1 + n) % n; while (!t.mitre[ia] && ia !== i) ia = (ia - 1 + n) % n;
                let fa = t.mitre[ia], fb = t.mitre[i] || fa;
                if (fa.hidden) fa = fb; else if (fb.hidden) fb = fa;     // against a wall that's hidden (the tier it stands out of): square to the face
                let mx = fa.nx + fb.nx, my = fa.ny + fb.ny; const m = Math.hypot(mx, my);
                if (m < 1e-3) return [v[0] + fb.nx * out, v[1] + fb.ny * out];
                mx /= m; my /= m;
                const s = out / Math.max(0.35, mx * fb.nx + my * fb.ny);
                return [v[0] + mx * s, v[1] + my * s];
            }

            /** The tier's art strip (day, lit), painted once: x along its plan from vertex 0, y down from its top (z1). */
            _tkArt(t) {
                if (t.art) return t.art;
                const S = t.S || 2, H = t.z1 - t.z0, L = t.perimeter;
                const mk = () => { const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.ceil(L * S)); cv.height = Math.max(1, Math.ceil(H * S)); const c = cv.getContext('2d'); c.scale(S, S); return [cv, c]; };
                const [dcv, d] = mk(), [lcv, l] = mk();
                t.paint(d, l, t, H, L);
                LandmarkKit.stats.baked++;
                return (t.art = { day: dcv, lit: lcv, S, H });
            }

            /** A face's slice of its tier's strip on its leaning quad, from z0 up to z1 (tiles in u and z). */
            _tkMap(ctx, f, tex, S, base) {
                const t = f.tier, L = f.L, G = this._tkGrid(f), nu = G.nu, nz = G.nz, p = G.p, row = (nu + 1) * 2;
                if (base) { this._tkQuad(ctx, f, f.z0, f.z1); ctx.fillStyle = base; ctx.fill(); }
                const ov = base ? S : 0.5;            // tiles overlap a world px (no seams); the additive glow barely, or the overlaps glow twice
                const V = typeof game !== 'undefined' && ctx.canvas === game.canvas && game._cullBounds && game._cullBounds.view, m = 4;   // (a tile off the screen is skipped; not in a bake or a mirror, which have views of their own)
                // each tile's transform is composed onto the context's here and set outright (no save / restore per tile)
                const M = ctx.getTransform(), Ma = M.a, Mb = M.b, Mc = M.c, Md = M.d, Me = M.e, Mf = M.f, du = L * S / nu, dz = (f.z1 - f.z0) / nz;
                let drew = false;
                for (let j = 0; j < nz; j++) for (let i = 0; i < nu; i++) {
                    const ia = j * row + i * 2, id = ia + row;
                    const ax = p[ia], ay = p[ia + 1], bx = p[ia + 2], by = p[ia + 3], dx = p[id], dy = p[id + 1];
                    if (V) {
                        const cx = bx + dx - ax, cy = by + dy - ay;
                        if (Math.max(ax, bx, dx, cx) < V.left - m || Math.min(ax, bx, dx, cx) > V.right + m ||
                            Math.max(ay, by, dy, cy) < V.top - m || Math.min(ay, by, dy, cy) > V.bottom + m) continue;
                    }
                    const z1 = f.z0 + dz * (j + 1);
                    const sx = f.u0 * S + i * du, sw = Math.min(tex.width - sx, du + ov), sy = (t.z1 - z1) * S, sh = Math.min(tex.height - sy, dz * S + ov);
                    if (sw <= 0 || sh <= 0) continue;
                    const ta = (bx - ax) / du, tb = (by - ay) / du, tc = (ax - dx) / (dz * S), td = (ay - dy) / (dz * S);
                    ctx.setTransform(Ma * ta + Mc * tb, Mb * ta + Md * tb, Ma * tc + Mc * td, Mb * tc + Md * td, Ma * dx + Mc * dy + Me, Mb * dx + Md * dy + Mf);
                    ctx.drawImage(tex, sx, sy, sw, sh, 0, 0, sw, sh);
                    drew = true;
                }
                if (drew) ctx.setTransform(M);
            }
            /**
             * How many tiles (across, up) a face needs, at most (nu, nz). A point at height z draws at cam + (p − cam)·k(z): along a
             * row (one z) that's exact for an affine tile, but up the wall k isn't linear in z, so a tile's art slides along the wall
             * by up to D·|k(mid) − (k(z0) + k(z1)) / 2| (D: how far the face's ends are from the camera), a quarter of that with
             * twice the rows; and a tile's far corner misses by its width × its k span (the twist), both × the zoom on screen.
             */
            _tkTiles(f, nu, nz) {
                const cam = game.camera, zoom = cam.zoom || 1;
                const k0 = this._tkK(f.z0), k1 = this._tkK(f.z1), km = this._tkK((f.z0 + f.z1) / 2);
                const D = Math.max(Math.hypot(f.x1 - cam.x, f.y1 - cam.y), Math.hypot(f.x2 - cam.x, f.y2 - cam.y));
                const slide = zoom * D * Math.abs(km - (k0 + k1) / 2), dkTop = (rows) => k1 - this._tkK(f.z1 - (f.z1 - f.z0) / rows);
                // what the stock tiles miss by: never ask for better than that (no face gets worse than it was, only cheaper)
                const stock = Math.max(slide / (nz * nz), zoom * f.L / nu * dkTop(nz));
                const err = Math.max(_TK_ERR[Math.max(0, Math.min(2, _zoomLOD | 0))], stock);
                // the fewest tiles that hold both: more rows shrink the slide and each tile's k span, more columns its width
                let best = null;
                for (let rows = Math.max(1, Math.min(nz, Math.ceil(Math.sqrt(slide / err)))); rows <= nz; rows++) {
                    const cols = Math.max(1, Math.ceil(zoom * f.L * dkTop(rows) / err - 1e-9));   // (the top row's k span: the widest, k is convex in z)
                    if (cols <= nu && rows * rows * err >= slide - 1e-9 && (!best || cols * rows < best[0] * best[1])) best = [cols, rows];
                }
                return best || [nu, nz];                                          // (needing more than the stock tiles: the stock tiles)
            }
            /** A face's tile corners on screen (from where the camera stands now): (nu + 1) × (nz + 1) points, row by row up from z0. */
            _tkGrid(f) {
                const v = this._tkView();
                let G = v.grids.get(f);
                if (G) return G;
                const t = f.tier, tile = t.tile || _TK_TILE, cam = game.camera, cx = cam.x, cy = cam.y;
                let nu = Math.max(1, Math.ceil(f.L / tile[0])), nz = Math.max(2, Math.ceil((f.z1 - f.z0) / tile[1]));
                if (TierKit.LOD) [nu, nz] = this._tkTiles(f, nu, nz);
                const p = new Float64Array((nu + 1) * (nz + 1) * 2);
                let o = 0;
                for (let j = 0; j <= nz; j++) {
                    const k = this._tkK(f.z0 + (f.z1 - f.z0) * j / nz);
                    for (let i = 0; i <= nu; i++) {
                        const u = i / nu;
                        p[o++] = cx + (f.x1 + (f.x2 - f.x1) * u - cx) * k; p[o++] = cy + (f.y1 + (f.y2 - f.y1) * u - cy) * k;
                    }
                }
                v.grids.set(f, G = { nu, nz, p });
                return G;
            }
            _tkQuad(ctx, f, z0, z1) {
                const a = this._tkP(f.x1, f.y1, z0), b = this._tkP(f.x2, f.y2, z0), c = this._tkP(f.x2, f.y2, z1), d = this._tkP(f.x1, f.y1, z1);
                ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
            }
            /** How far a face turns from the light (the moon or sun, from the west and a little south): 0 lit .. 1 turned away. */
            _tkTurn(f) { const lx = -0.78, ly = 0.62; return Math.max(0, Math.min(1, 0.5 - 0.5 * (f.nx * lx + f.ny * ly))); }

            /** The ledges round a tier at height z along its visible faces: mitred slabs, each face's front shaded by its turn. */
            _tkLedges(ctx, t, faces, g) {
                const cam = game.camera, p = (x, y, k) => [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k], n = t.poly.length;
                const kT = this._tkK(g.z), kB = this._tkK(Math.max(t.z0, g.z - g.th)), [r, gg, b] = g.band;
                const fine = !TierKit.LOD || _zoomLOD < 2;                               // (zoomed right out: the lip and the shadow line under it, a px wide, go)
                for (const f of faces) {
                    if (g.z <= f.z0 + 0.5 || g.z > f.z1 + 0.5) continue;
                    // where the ledge runs in the world and its front's colour don't change with the camera: once per face and ledge
                    const lc = f.ledgeCache || (f.ledgeCache = new Map());
                    let L = lc.get(g);
                    if (!L) {
                        const i = f.edge, va = t.poly[i], vb = t.poly[(i + 1) % n], s = 1 - 0.5 * this._tkTurn(f);
                        L = { oa: f.atA ? this._tkMitre(t, i, g.out) : [f.x1 + f.nx * g.out, f.y1 + f.ny * g.out],
                              ob: f.atB ? this._tkMitre(t, (i + 1) % n, g.out) : [f.x2 + f.nx * g.out, f.y2 + f.ny * g.out],
                              wa: f.atA ? va : [f.x1, f.y1], wb: f.atB ? vb : [f.x2, f.y2],
                              front: `rgb(${Math.round(r * s)}, ${Math.round(gg * s)}, ${Math.round(b * s)})` };
                        lc.set(g, L);
                    }
                    const { oa, ob, wa, wb } = L;
                    const A = p(oa[0], oa[1], kB), B = p(ob[0], ob[1], kB), Bt = p(ob[0], ob[1], kT), At = p(oa[0], oa[1], kT), a1 = p(wa[0], wa[1], kT), b1 = p(wb[0], wb[1], kT);
                    ctx.fillStyle = L.front;
                    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(Bt[0], Bt[1]); ctx.lineTo(At[0], At[1]); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = g.top; ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.lineTo(Bt[0], Bt[1]); ctx.lineTo(At[0], At[1]); ctx.closePath(); ctx.fill();
                    if (fine && g.lip) { ctx.strokeStyle = g.lip; ctx.globalAlpha = 1 - 0.6 * this._tkTurn(f); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(At[0], At[1]); ctx.lineTo(Bt[0], Bt[1]); ctx.stroke(); ctx.globalAlpha = 1; }
                    if (fine) { ctx.strokeStyle = 'rgba(6, 12, 14, 0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); }
                }
            }

            /** A tier's roof, painted once into a sprite in world coordinates (its plane is its top). */
            _tkRoof(t, emissive) {
                const [x0, y0, x1, y1] = t.box, m = 16;
                return LandmarkKit.sprite(this, (emissive ? 'tk_roof_lit_' : 'tk_roof_') + t.i, x0 - m, y0 - m, x1 - x0 + m * 2, y1 - y0 + m * 2, t.roofRes || 1.5, (c) => t.roof(c, emissive, t, this));
            }

            /** The tiers in drawing order: farthest group first (a tier and those standing on it), then by height (lower tops first). */
            _tkOrder() {
                const cam = game.camera, g = this._tkGeo();
                const dist = (t) => { const [x0, y0, x1, y1] = t.root.box, dx = Math.max(x0 - cam.x, 0, cam.x - x1), dy = Math.max(y0 - cam.y, 0, cam.y - y1); return dx * dx + dy * dy; };
                return g.tiers.slice().sort((a, b) => (dist(b) - dist(a)) || (a.z1 - b.z1) || (a.z0 - b.z0) || (a.i - b.i));
            }
            _tkVisible(t) {
                const v = this._tkView();
                let faces = v.visible.get(t);
                if (!faces) v.visible.set(t, faces = this._tkFacing(t));
                return faces;
            }
            /** A tier's faces turned to the camera, farthest first (see _tkVisible: the cached copy). */
            _tkFacing(t) {
                const cam = game.camera;
                return t.faces.filter(f => (cam.x - (f.x1 + f.x2) / 2) * f.nx + (cam.y - (f.y1 + f.y2) / 2) * f.ny > 0)
                    .sort((a, b) => Math.hypot(cam.x - (b.x1 + b.x2) / 2, cam.y - (b.y1 + b.y2) / 2) - Math.hypot(cam.x - (a.x1 + a.x2) / 2, cam.y - (a.y1 + a.y2) / 2));
            }

            /**
             * What drawing needs from where the camera stands: the tiers' order, the faces each turns to the camera, each tier's
             * outline on screen and each face's tile corners. Worked out as it's asked for, kept until the camera, the zoom
             * (the lean) or the building moves: the walls, the glow, other buildings' glow clips and the mirrors all share it.
             */
            _tkView() {
                const cam = game.camera, C = leanCamHeight(), lean = CONFIG.BUILDINGS.LEAN, geo = this._tkGeo(), v = this._tkV;
                const zoom = cam.zoom || 1, lod = TierKit.LOD ? _zoomLOD | 0 : -1;
                if (v && v.cx === cam.x && v.cy === cam.y && v.C === C && v.lean === lean && v.geo === geo && v.zoom === zoom && v.lod === lod) return v;
                return (this._tkV = { cx: cam.x, cy: cam.y, C, lean, geo, zoom, lod, order: null, visible: new Map(), hulls: new Map(), boxes: new Map(), grids: new Map(), occluders: null });
            }
            /** The tiers in drawing order, from where the camera stands (cached; subclasses refine _tkOrder). */
            _tkOrdered() { const v = this._tkView(); return v.order || (v.order = this._tkOrder()); }
            /** A tier's outline on screen (cached per vantage) and its bounding box. */
            _tkHullOf(t) { const v = this._tkView(); let h = v.hulls.get(t); if (!h) v.hulls.set(t, h = this._tkHull(t)); return h; }
            _tkBoxOf(t) {
                const v = this._tkView(); let b = v.boxes.get(t);
                if (!b) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of this._tkHullOf(t)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } v.boxes.set(t, b = [x0, y0, x1, y1]); }
                return b;
            }
            /** The shade's fall-off up a wall: a gradient made once in a unit frame, along +y from 0 to 1 (laid onto each face by _tkFade). */
            _tkFadeGrad(ctx, key, c0, c1) {
                const store = this._tkGrads || (this._tkGrads = {});
                let g = store[key];
                if (!g) { g = ctx.createLinearGradient(0, 0, 0, 1); g.addColorStop(0, c0); g.addColorStop(1, c1); store[key] = g; }
                return g;
            }
            /** Fill the current path with a unit gradient laid from screen point A (0) to B (1). The path was set before: it keeps its place. */
            _tkFade(ctx, grad, A, B) {
                const c = B[0] - A[0], d = B[1] - A[1];
                if (c * c + d * d < 1e-6) return;
                const M = ctx.getTransform();
                ctx.transform(d, -c, c, d, A[0], A[1]);              // (0, 1) → B, the gradient's cross-axis square to it
                ctx.fillStyle = grad; ctx.fill();
                ctx.setTransform(M);
            }

            drawTop(ctx) {
                if (!(CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera)) { super.drawTop(ctx); return; }
                ctx.save();
                for (const t of this._tkOrdered()) {
                    const faces = this._tkVisible(t), art = this._tkArt(t), sh = t.shade || [6, 16, 18];
                    const foot = this._tkFadeGrad(ctx, 'foot_' + sh.join(','), `rgba(${sh[0]}, ${sh[1]}, ${sh[2]}, 0.35)`, `rgba(${sh[0]}, ${sh[1]}, ${sh[2]}, 0)`);
                    const contact = this._tkFadeGrad(ctx, 'contact', 'rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 0)');
                    for (const f of faces) {
                        this._tkMap(ctx, f, art.day, art.S, t.fill || '#555');
                        this._tkQuad(ctx, f, f.z0, f.z1); ctx.fillStyle = f.shadeFill || (f.shadeFill = `rgba(${sh[0]}, ${sh[1]}, ${sh[2]}, ${0.03 + 0.4 * this._tkTurn(f)})`); ctx.fill();
                        if (f.z0 < 1) {                                                                  // the street's shade at the foot
                            this._tkQuad(ctx, f, 0, 22); this._tkFade(ctx, foot, this._tkP(f.x1, f.y1, 0), this._tkP(f.x1, f.y1, 22));
                        } else if (!TierKit.LOD || _zoomLOD < 2) {                                       // a contact shadow where it meets the roof below (zoomed right out: too thin to see)
                            this._tkQuad(ctx, f, f.z0, f.z0 + 8); this._tkFade(ctx, contact, this._tkP(f.x1, f.y1, f.z0), this._tkP(f.x1, f.y1, f.z0 + 8));
                        }
                    }
                    for (const g of t.ledgesByZ || (t.ledgesByZ = (t.ledges || []).slice().sort((a, b) => a.z - b.z))) this._tkLedges(ctx, t, faces, g);
                    if (t.roof) LandmarkKit.drawSprite(ctx, this._tkRoof(t, false), this._tkK(t.z1));
                    if (t.top) t.top(ctx, false, t, this);
                }
                ctx.restore();
            }

            /** How strongly the tiers' night light shows: 12% at the least once the sky starts to darken (a lit window reads at dusk), none in full daylight. */
            _tkGlow(dark) { return Math.max(0.12, Math.min(0.92, dark * 1.05)) * Math.min(1, Math.max(0, dark) / 0.12); }

            drawEmissive(ctx, dark, beamsOnly) {
                if (beamsOnly || !(CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera)) return;
                const glow = this._tkGlow(dark);
                if (glow < 0.004) return;                                              // broad day: the whole lit pass would add next to nothing
                ctx.save(); ctx.globalAlpha *= glow; ctx.globalCompositeOperation = 'lighter';
                // each tier's light is cut out of the tiers drawn over it (a window behind the bay mustn't shine through it)
                const order = this._tkOrdered(), hulls = order.map(t => this._tkHullOf(t)), boxes = order.map(t => this._tkBoxOf(t));
                order.forEach((t, i) => {
                    ctx.save();
                    const bi = boxes[i];
                    for (let j = i + 1; j < order.length; j++) {                       // one clip each: overlapping hulls in one even-odd path would cancel
                        const bj = boxes[j];
                        if (bj[0] > bi[2] || bj[2] < bi[0] || bj[1] > bi[3] || bj[3] < bi[1]) continue;   // (a hull clear of this tier's can't cover any of its light)
                        ctx.beginPath(); ctx.rect(-1e7, -1e7, 2e7, 2e7);
                        hulls[j].forEach(([x, y], n) => n ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
                        ctx.clip('evenodd');
                    }
                    const art = this._tkArt(t);
                    for (const f of this._tkVisible(t)) this._tkMap(ctx, f, art.lit, art.S, null);
                    if (t.roof && t.roofGlow) LandmarkKit.drawSprite(ctx, this._tkRoof(t, true), this._tkK(t.z1));
                    if (t.top) t.top(ctx, true, t, this);
                    ctx.restore();
                });
                ctx.restore();
            }

            /**
             * Its reflection in the wet street (engine/reflections.js, High and Ultra): each tier's lit walls mirrored about
             * the line its own front stands on (its plan's southmost y), foreshortened as the stock facades are. Only the
             * walls: no roofs (a mirror under a building can't see them), nor the searchlights, the forecourt's lamps
             * and the canopies' pools a landmark adds to its glow pass (those are on the ground, or in the sky).
             */
            drawReflection(ctx, dark) {
                if (!(CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera)) return;
                const glow = this._tkGlow(dark);
                if (glow < 0.004) return;
                ctx.save(); ctx.globalAlpha *= glow; ctx.globalCompositeOperation = 'lighter';
                for (const t of this._tkOrdered()) {
                    if (t.z1 - t.z0 < 12 && t.z0 < 1) continue;                     // (planters, posts: too low to show)
                    const gy = t.box[3];
                    ctx.save(); ctx.translate(0, gy); ctx.scale(1, -0.75); ctx.translate(0, -gy);
                    const art = this._tkArt(t);
                    for (const f of this._tkVisible(t)) this._tkMap(ctx, f, art.lit, art.S, null);
                    ctx.restore();
                }
                ctx.restore();
            }

            /** A tier on screen: the hull of its plan at its foot and at its top (and its `rise`'s apex: a dome on its top hook). */
            _tkHull(t) {
                const pts = [];
                for (const [x, y] of t.poly) pts.push(this._tkP(x, y, t.z0), this._tkP(x, y, t.z1));
                if (t.rise) { let cx = 0, cy = 0; for (const [x, y] of t.poly) { cx += x / t.poly.length; cy += y / t.poly.length; } pts.push(this._tkP(cx, cy, t.z1 + t.rise)); }
                return TierKit.hull(pts);
            }

            /** What hides the glow of buildings behind it: each tier, footprint to leaned roof. */
            _glowOccluders() {
                const v = this._tkView();
                return v.occluders || (v.occluders = v.geo.tiers.map(t => this._tkHullOf(t)));
            }

            /** The sun's shadow of each tier: its plan swept along the sun to its top. */
            _sunShadowHulls(dx, dy) {
                const c = this._tkSun;
                if (c && c.dx === dx && c.dy === dy && c.x === this.x && c.y === this.y) return c.hulls;
                const hulls = this._tkGeo().tiers.filter(t => t.z0 < 1 || t.castShadow).map(t => TierKit.hull(t.poly.map(p => p.slice()).concat(t.poly.map(([x, y]) => [x + dx * t.z1, y + dy * t.z1]))));
                this._tkSun = { dx, dy, x: this.x, y: this.y, hulls };
                return hulls;
            }
        }

        /** The Full profiler's rows (RenderTags): the tiers' walls and roofs, their night light, and the art baked once.
            A building on the kit passes its class to TierKit.profile, so its own overrides bill the same rows. */
        TierKit.PROFILE = {
            drawTop: ['Tiered buildings', ['World tops']],
            drawEmissive: ['Tiered lights', ['Glow']],
            _tkArt: ['Bakes', ['World tops', 'Glow']],
            _tkRoof: ['Bakes', ['World tops', 'Glow']]
        };
        TierKit.profile = (cls) => RenderTags.tagClass(cls, TierKit.PROFILE);
        TierKit.profile(TieredBuilding);
        RenderTags.tag(LandmarkKit, 'sprite', 'Bakes', ['Buildings', 'World tops', 'Glow']);
