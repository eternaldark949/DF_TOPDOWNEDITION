        const HAIR_SIM = {
            STEP: 1 / 120,          // game seconds per physics slice
            MAX_STEPS: 12,          // catch-up cap after a stall
            SNAP: 80,               // a root jump bigger than this (teleport) resets the hair
            HEAD_R: 8.5             // strands are kept outside the head
        };

        /** Evenly spaced roots on the back half of the head, fanning outward. */
        function _hairFan(count, radius, fromDeg, toDeg, fan, segs, len, extra = {}) {
            const out = [];
            for (let i = 0; i < count; i++) {
                const t = count === 1 ? 0.5 : i / (count - 1);
                const th = (fromDeg + (toDeg - fromDeg) * t) * Math.PI / 180;
                out.push(Object.assign({ root: { x: -2 + Math.cos(th) * radius, y: Math.sin(th) * radius },
                                         dir: Math.PI + (th - Math.PI) * fan, segs, len, i }, extra));
            }
            return out;
        }

        const HAIR_LAYOUTS = {
            ponytail:     { damping: 0.955, stiffness: 0.020, strands: [{ root: { x: -9, y: 0 }, dir: Math.PI, segs: 6, len: 4.4 }] },
            braids:       { damping: 0.95,  stiffness: 0.018, strands: [
                              { root: { x: -5, y: -6 }, dir: Math.PI + 0.35, segs: 7, len: 3.2 },
                              { root: { x: -5, y:  6 }, dir: Math.PI - 0.35, segs: 7, len: 3.2 }] },
            long:         { damping: 0.93,  stiffness: 0.030, strands: _hairFan(7, 9, 105, 255, 0.35, 5, 5.2) },
            dreadlocks:   { damping: 0.94,  stiffness: 0.035, strands: _hairFan(8, 8, 100, 260, 0.6, 4, 4.5) },
            demon_dancer: { damping: 0.965, stiffness: 0.010, wiggle: 0.05, strands: _hairFan(5, 8, 130, 230, 1.25, 8, 5.6) },
            afro:  { jiggle: 1.0 },
            curls: { jiggle: 1.4 },
            short: { jiggle: 0.4 }
        };

        // Rest geometry is transient, like _simOut: a draw consumes it before another hair call.
        // Cache each immutable layout's points instead of allocating the same nested arrays per body.
        const _hairRestCache = new WeakMap(), _hairMetrics = new WeakMap();
        function _hairRest(layout, headX, sway = 0) {
            let cache = _hairRestCache.get(layout);
            if (!cache) {
                cache = { headX: NaN, sway: NaN, strands: (layout.strands || []).map(s =>
                    Array.from({ length: s.segs + 1 }, () => ({ x: 0, y: 0 }))), jig: { x: 0, y: 0 }, lod: 0 };
                _hairRestCache.set(layout, cache);
            }
            if (cache.headX !== headX || cache.sway !== sway) {
                const specs = layout.strands || [];
                for (let si = 0; si < specs.length; si++) {
                    const s = specs[si], pts = cache.strands[si], a = s.dir - sway;
                    const dx = Math.cos(a) * s.len, dy = Math.sin(a) * s.len;
                    let x = headX + s.root.x, y = s.root.y;
                    pts[0].x = x; pts[0].y = y;
                    for (let i = 1; i <= s.segs; i++) { x += dx; y += dy; pts[i].x = x; pts[i].y = y; }
                }
                cache.headX = headX; cache.sway = sway;
            }
            return cache.strands;
        }
        function _hairDrawLOD(ctx) {
            // Portraits and sprite bakes must never inherit the live camera's distant detail.
            return _worldMatrix && ctx.canvas === _worldCanvas && typeof _zoomLOD !== 'undefined' ? _zoomLOD : 0;
        }

        const _HAIR_ROOT = { x: 0, y: 0 }, _HAIR_HEAD = { x: 0, y: 0 };   // transient world points, reused
        /**
         * Current hair geometry in the head frame: { strands: [[{x,y}...]...], jig: {x,y} }.
         * Steps the owner's physics when drawn on the main canvas; otherwise the rest pose.
         */
        function hairGeometry(ctx, headX, hair, dyn) {
            const layout = HAIR_LAYOUTS[hair.type];
            if (!layout) return { strands: [], jig: { x: 0, y: 0 }, lod: 0 };
            const owner = dyn && dyn.owner, sway = (dyn && dyn.sway) || 0;
            const T = owner && !_crowdLite ? _simTransform(ctx) : null;       // head frame → world (see ui/cloth.js); a lighter crowd: at rest
            if (!T) {
                _hairRest(layout, headX, sway * 0.5);
                const rest = _hairRestCache.get(layout); rest.lod = _hairDrawLOD(ctx);
                return rest;
            }
            const { toW, toLInto, sc, ang: baseAngle, M } = T;
            const head = _HAIR_HEAD;
            head.x = M.a * headX + M.c * 0 + M.e; head.y = M.b * headX + M.d * 0 + M.f;

            let sim = owner._hairSim;
            const reset = !sim || sim.type !== hair.type || Math.hypot(sim.headX - head.x, sim.headY - head.y) > HAIR_SIM.SNAP * sc;
            if (reset) {
                sim = owner._hairSim = { type: hair.type, t: _gameTimeSec, acc: 0, headX: head.x, headY: head.y, ang: baseAngle,
                                         jig: { x: head.x, y: head.y, vx: 0, vy: 0 }, strands: [] };
                const rest = _hairRest(layout, headX, sway * 0.5);
                sim.strands = rest.map(pts => pts.map(p => { const w = toW(p.x, p.y); return { x: w.x, y: w.y, px: w.x, py: w.y }; }));
            }

            // How many fixed slices of game time to run this frame
            const steps = _simSteps(sim, HAIR_SIM.STEP, HAIR_SIM.MAX_STEPS);

            const specs = layout.strands || [];
            let metrics = _hairMetrics.get(layout);
            if (!metrics) {
                metrics = specs.map(spec => {
                    const u = [], spring = [];
                    for (let i = 1; i <= spec.segs; i++) { u[i] = i / spec.segs; spring[i] = layout.stiffness * (1 - 0.6 * u[i]); }
                    return { u, spring };
                });
                _hairMetrics.set(layout, metrics);
            }
            const hx0 = sim.headX, hy0 = sim.headY, a0 = sim.ang;
            let dA = baseAngle - a0; while (dA > Math.PI) dA -= Math.PI * 2; while (dA < -Math.PI) dA += Math.PI * 2;

            if (steps === 0) {
                // Between slices: carry the hair rigidly with the head so it stays attached
                const dx = head.x - hx0, dy = head.y - hy0;
                for (let si = 0; si < sim.strands.length; si++) {
                    const pts = sim.strands[si], root = _HAIR_ROOT, lx = headX + specs[si].root.x, ly = specs[si].root.y;
                    root.x = M.a * lx + M.c * ly + M.e; root.y = M.b * lx + M.d * ly + M.f;
                    const rx = root.x - pts[0].x, ry = root.y - pts[0].y;
                    for (const p of pts) { p.x += rx; p.y += ry; p.px += rx; p.py += ry; }
                }
                sim.jig.x += dx; sim.jig.y += dy;
            }
            for (let k = 1; k <= steps; k++) {
                const f = k / steps;
                // Head pose for this slice, interpolated from last frame's pose
                const ang = a0 + dA * f;
                const c = Math.cos(ang), s = Math.sin(ang);
                const hx = hx0 + (head.x - hx0) * f, hy = hy0 + (head.y - hy0) * f;
                const time = sim.t + (k - steps) * HAIR_SIM.STEP;

                for (let si = 0; si < sim.strands.length; si++) {
                    const spec = specs[si], pts = sim.strands[si], metric = metrics[si];
                    // the strand's root for this slice, in the world (as sliceW(lx, ly) was, without its object)
                    const root = _HAIR_ROOT, lx = headX + spec.root.x, ly = spec.root.y;
                    root.x = hx + (c * (lx - headX) - s * ly) * sc; root.y = hy + (s * (lx - headX) + c * ly) * sc;
                    pts[0].px = pts[0].x; pts[0].py = pts[0].y; pts[0].x = root.x; pts[0].y = root.y;
                    const restA = ang + spec.dir - sway * 0.5;          // rest direction swings with the shoulders
                    const rc = Math.cos(restA), rs = Math.sin(restA);
                    const n = pts.length - 1, L = spec.len * sc;
                    for (let i = 1; i <= n; i++) {
                        const p = pts[i];
                        const vx = (p.x - p.px) * layout.damping, vy = (p.y - p.py) * layout.damping;
                        // Spring toward the rest pose — stiff near the scalp, loose at the tips
                        const k0 = metric.spring[i];
                        let ax = (root.x + rc * L * i - p.x) * k0, ay = (root.y + rs * L * i - p.y) * k0;
                        if (dyn && dyn.wind) { ax += dyn.wind.x * sc * metric.u[i]; ay += dyn.wind.y * sc * metric.u[i]; }   // the weather's wind
                        if (layout.wiggle) {                           // restless tendrils
                            const w = Math.sin(time * 5 + i * 0.9 + si * 1.7) * layout.wiggle * sc * metric.u[i];
                            ax += -rs * w; ay += rc * w;
                        }
                        p.px = p.x; p.py = p.y;
                        p.x += vx + ax; p.y += vy + ay;
                    }
                    // Keep segment lengths exact (follow the leader) and strands off the head, then
                    // feed each correction back into the previous point's velocity (Müller's
                    // "dynamic FTL") — plain FTL pumps energy in and makes strands zigzag.
                    const R = HAIR_SIM.HEAD_R * sc;
                    let corrX = sim._cx || (sim._cx = []), corrY = sim._cy || (sim._cy = []);
                    for (let i = 1; i <= n; i++) {
                        const a = pts[i - 1], p = pts[i];
                        const bx = p.x, by = p.y;
                        const hdx = p.x - hx, hdy = p.y - hy;
                        if (Math.abs(hdx) < R && Math.abs(hdy) < R) {
                            const hd = Math.hypot(hdx, hdy);
                            if (hd < R && hd > 0.001) { p.x = hx + hdx / hd * R; p.y = hy + hdy / hd * R; }
                        }
                        const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy) || 1;
                        p.x = a.x + dx / d * L; p.y = a.y + dy / d * L;
                        corrX[i] = p.x - bx; corrY[i] = p.y - by;
                    }
                    for (let i = 1; i < n; i++) { pts[i].px += 0.9 * corrX[i + 1]; pts[i].py += 0.9 * corrY[i + 1]; }
                }
                // Volume jiggle: a damped spring chasing the head
                if (layout.jiggle) {
                    const j = sim.jig;
                    j.vx = (j.vx + (hx - j.x) * 0.12) * 0.82;
                    j.vy = (j.vy + (hy - j.y) * 0.12) * 0.82;
                    j.x += j.vx; j.y += j.vy;
                }
            }
            sim.headX = head.x; sim.headY = head.y; sim.ang = baseAngle;

            const strands = _simOut(sim, sim.strands, toLInto);
            const geo = sim._hairGeo || (sim._hairGeo = { strands, jig: { x: 0, y: 0 }, lod: 0 });
            const jig = geo.jig; jig.x = 0; jig.y = 0;
            if (layout.jiggle) {
                const l0 = toLInto(sim._hairL0 || (sim._hairL0 = { x: 0, y: 0 }), head.x, head.y);
                const l1 = toLInto(sim._hairL1 || (sim._hairL1 = { x: 0, y: 0 }), sim.jig.x, sim.jig.y);
                let jx = (l1.x - l0.x) * layout.jiggle, jy = (l1.y - l0.y) * layout.jiggle;
                const jm = Math.hypot(jx, jy), cap = 3;
                if (jm > cap) { jx *= cap / jm; jy *= cap / jm; }
                jig.x = jx; jig.y = jy;
            }
            geo.strands = strands; geo.lod = _hairDrawLOD(ctx);
            return geo;
        }

        /** Stroke a strand with a width that tapers from w0 (root) to w1 (tip). */
        function _taperedStrand(ctx, pts, w0, w1, lod = 0) {
            ctx.lineCap = 'round';
            const n = pts.length - 1;
            if (!lod) {
                const d = Math.max(1, pts.length - 2);
                for (let i = 1; i < pts.length; i++) {
                    ctx.lineWidth = w0 + (w1 - w0) * ((i - 1) / d);
                    ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
                }
            } else {
                // Keep every curve point and both ends; fewer width bands at distant zoom.
                // Physics topology never changes, so returning to full detail needs no reset.
                const group = lod >= 2 ? 3 : 2, bands = Math.ceil(n / group), join = ctx.lineJoin;
                ctx.lineJoin = 'round';
                for (let i = 0, band = 0; i < n; i += group, band++) {
                    const end = Math.min(n, i + group);
                    ctx.lineWidth = w0 + (w1 - w0) * (band / Math.max(1, bands - 1));
                    ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y);
                    for (let j = i + 1; j <= end; j++) ctx.lineTo(pts[j].x, pts[j].y);
                    ctx.stroke();
                }
                ctx.lineJoin = join;
            }
            ctx.lineCap = 'butt';
        }

        // Fixed curl positions and bounce weights; exactly the original crown and highlight math.
        const _HAIR_CURL_RING = Array.from({ length: 10 }, (_, i) => {
            const th = (i / 10) * Math.PI * 2 + 0.3;
            const back = Math.cos(th) < 0 ? 1 : 0.6;
            return { x: Math.cos(th) * 8.5 * back, y: Math.sin(th) * 8.5, r: 4 + (i % 2) * 0.8, bounce: 1 + (i % 2) * 0.5 };
        });
        const _HAIR_CURL_HIGHLIGHTS = Array.from({ length: 5 }, (_, i) => ({ x: Math.cos(i * 1.3) * 4, y: Math.sin(i * 1.3) * 4 }));

        // Hair renderers: (ctx, color, headX, dyn, geo) where geo = hairGeometry(...)
        const HAIR_RENDERERS = {
            long(ctx, color, headX, dyn, geo) {
                const S = geo.strands;
                ctx.fillStyle = color; ctx.strokeStyle = color;
                if (S.length) {
                    // Curtain: down the outer strands, across the tips, back up
                    const L = S[0], R = S[S.length - 1];
                    ctx.beginPath();
                    ctx.moveTo(L[0].x, L[0].y);
                    for (let i = 1; i < L.length; i++) ctx.lineTo(L[i].x, L[i].y);
                    for (let s = 1; s < S.length - 1; s++) { const tip = S[s][S[s].length - 1]; ctx.lineTo(tip.x, tip.y); }
                    for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i].x, R[i].y);
                    ctx.closePath(); ctx.fill();
                    // Soft rounded ends and strand texture
                    for (const st of S) _taperedStrand(ctx, st, 4, 3, geo.lod);
                    const a0 = ctx.globalAlpha;
                    ctx.strokeStyle = _hairShade(color, 0.25); ctx.globalAlpha = a0 * 0.35;
                    for (let s = 1; s < S.length - 1; s++) _taperedStrand(ctx, S[s], 1, 0.6, geo.lod);
                    ctx.globalAlpha = a0;
                }
                // Crown
                ctx.fillStyle = color;
                ctx.beginPath(); ctx.ellipse(headX - 2, 0, 10.5, 10, 0, 0, Math.PI * 2); ctx.fill();
            },
            afro(ctx, color, headX, dyn, geo) {
                ctx.fillStyle = color;
                const j = geo.jig, hx = headX - 3 + j.x, hy = j.y;
                ctx.beginPath(); ctx.arc(hx, hy, 11, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(hx + 2 + j.x * 0.4, -8 + hy * 1.3, 7, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(hx - 6 + j.x * 0.4, -3 + hy * 1.2, 8, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(hx - 2 + j.x * 0.4, 7 + hy * 1.3, 7, 0, Math.PI * 2); ctx.fill();
            },
            curls(ctx, color, headX, dyn, geo) {
                const j = geo.jig, cx = headX - 1;
                ctx.fillStyle = color;
                ctx.beginPath(); ctx.arc(cx + j.x * 0.5, j.y * 0.5, 9.5, 0, Math.PI * 2); ctx.fill();
                // An even ring of curls around the crown; outer curls bounce more
                for (const curl of _HAIR_CURL_RING) {
                    ctx.beginPath();
                    ctx.arc(cx + curl.x + j.x * curl.bounce, curl.y + j.y * curl.bounce, curl.r, 0, Math.PI * 2);
                    ctx.fill();
                }
                // Tiny texture marks can be farther apart at distant zoom; outer curls stay complete.
                const a0 = ctx.globalAlpha;
                ctx.fillStyle = _hairShade(color, -0.15); ctx.globalAlpha = a0 * 0.35;
                const stride = geo.lod >= 2 ? 3 : (geo.lod ? 2 : 1);
                for (let i = 0; i < _HAIR_CURL_HIGHLIGHTS.length; i += stride) {
                    const mark = _HAIR_CURL_HIGHLIGHTS[i];
                    ctx.beginPath(); ctx.arc(cx + mark.x + j.x * 0.5, mark.y + j.y * 0.5, 1.6, 0, Math.PI * 2); ctx.fill();
                }
                ctx.globalAlpha = a0;
            },
            demon_dancer(ctx, color, headX, dyn, geo) {
                const hairColor = color || '#0a0000';
                ctx.strokeStyle = hairColor; ctx.fillStyle = hairColor;
                // 4–5 separate tendrils of varied weight; the thin ones are translucent
                const a0 = ctx.globalAlpha;
                for (let i = 0; i < geo.strands.length; i++) {
                    const st = geo.strands[i];
                    ctx.globalAlpha = a0 * (i % 2 ? 0.65 : 1);
                    _taperedStrand(ctx, st, i % 2 ? 2.6 : 4.4, 0.8, geo.lod);
                }
                ctx.globalAlpha = a0;
                ctx.beginPath(); ctx.ellipse(headX - 1, 0, 9.5, 8.5, 0, 0, Math.PI * 2); ctx.fill();
            },
            short(ctx, color, headX, dyn, geo) {
                const j = geo.jig;
                ctx.fillStyle = color;
                // Full cap with small side ruffles; no trailing tail — short hair doesn't trail
                ctx.beginPath(); ctx.ellipse(headX + j.x * 0.3, j.y * 0.3, 10, 9, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(headX - 7 + j.x, -3 + j.y, 4, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(headX - 7 + j.x, 3 + j.y, 3.5, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(headX + 5, -3, 3.5, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(headX + 5, 3, 3, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(headX - 8 + j.x, j.y, 3.5, 5, 0, 0, Math.PI * 2); ctx.fill();
            },
            braids(ctx, color, headX, dyn, geo) {
                ctx.fillStyle = color; ctx.strokeStyle = color;
                const dark = _hairShade(color, 0.3);
                for (const st of geo.strands) {
                    _taperedStrand(ctx, st, 3.6, 2.8, geo.lod);
                    // Woven look: alternating plaits along the braid
                    const stride = geo.lod >= 2 ? 3 : (geo.lod ? 2 : 1);
                    for (let i = 1; i < st.length; i += stride) {
                        const plait = Math.ceil(i / stride);
                        const a = st[i - 1], b = st[i], ang = Math.atan2(b.y - a.y, b.x - a.x);
                        ctx.save(); ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2); ctx.rotate(ang + (plait % 2 ? 0.5 : -0.5));
                        ctx.fillStyle = plait % 2 ? color : dark;
                        ctx.beginPath(); ctx.ellipse(0, 0, 2.2, 1.6, 0, 0, Math.PI * 2); ctx.fill();
                        ctx.restore();
                    }
                    const tip = st[st.length - 1];
                    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(tip.x, tip.y, 1.8, 0, Math.PI * 2); ctx.fill();
                }
                ctx.fillStyle = color;
                ctx.beginPath(); ctx.ellipse(headX - 1, 0, 10, 9, 0, 0, Math.PI * 2); ctx.fill();
                // Centre part
                const a0 = ctx.globalAlpha;
                ctx.strokeStyle = dark; ctx.lineWidth = 1; ctx.globalAlpha = a0 * 0.6;
                ctx.beginPath(); ctx.moveTo(headX + 7, 0); ctx.lineTo(headX - 8, 0); ctx.stroke();
                ctx.globalAlpha = a0;
            },
            dreadlocks(ctx, color, headX, dyn, geo) {
                ctx.strokeStyle = color; ctx.fillStyle = color;
                for (const st of geo.strands) _taperedStrand(ctx, st, 4, 3.2, geo.lod);
                ctx.beginPath(); ctx.ellipse(headX, 0, 10, 9, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(headX - 7, -3, 4, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(headX - 7, 3, 4, 0, Math.PI * 2); ctx.fill();
            },
            ponytail(ctx, color, headX, dyn, geo) {
                ctx.fillStyle = color; ctx.strokeStyle = color;
                for (const st of geo.strands) _taperedStrand(ctx, st, 5, 3, geo.lod);
                // Sleek base pulled tight over the head, tight side volume, and the tie
                ctx.beginPath(); ctx.ellipse(headX, 0, 10, 9, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(headX - 7, -3, 3.5, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(headX - 7, 3, 3.5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = _hairShade(color, 0.35);
                ctx.beginPath(); ctx.arc(headX - 9, 0, 2.6, 0, Math.PI * 2); ctx.fill();
            }
        };
        
        /* ── Hair finish ── Close up (LOD 0) every style gets depth over its flat fill: the crown darkens
           toward its edge (the hair curving away), strands sweep back from the hairline (or out from a
           part, or into a tie; tight styles get coils), and a soft sheen band rides the crown. Baked once
           per style and colour into a small sprite; long styles add a sheen down their loose strands. */
        // type → [crown x offset, rx, ry, how the strands lie, jig follow]
        const HAIR_CROWNS = {
            long: [-2, 10.5, 10, 'sweep', 0], short: [0, 10, 9, 'sweep', 0.3], ponytail: [0, 10, 9, 'tie', 0],
            braids: [-1, 10, 9, 'part', 0], dreadlocks: [0, 10, 9, 'sweep', 0], demon_dancer: [-1, 9.5, 8.5, 'sweep', 0],
            afro: [-3, 11, 11, 'coil', 1], curls: [-1, 9.5, 9.5, 'coil', 0.5]
        };
        const _hairFinishSprites = new Map();
        const HAIR_FINISH_K = 4;                                       // sprite px per body unit (crisp when zoomed in)
        function _hairLuma(hex) {
            const n = parseInt(hex.slice(1), 16);
            return (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255;
        }
        function _hairFinishSprite(type, color) {
            const key = type + color;
            let cv = _hairFinishSprites.get(key);
            if (cv) return cv;
            const [, rx, ry, lie] = HAIR_CROWNS[type], K = HAIR_FINISH_K, pad = 1;
            cv = document.createElement('canvas');
            cv.width = Math.ceil((rx + pad) * 2 * K); cv.height = Math.ceil((ry + pad) * 2 * K);
            const c = cv.getContext('2d');
            c.translate(cv.width / 2, cv.height / 2); c.scale(K, K);
            c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); c.clip();
            const luma = _hairLuma(color), dark = _hairShade(color, 0.5);
            const lift = lightenHex(color, luma < 0.25 ? 95 : 60), mid = lightenHex(color, luma < 0.25 ? 45 : 28);
            // Depth: the crown falls away into shadow at its edge, nearest the hairline stays fullest
            const g = c.createRadialGradient(rx * 0.2, 0, 0, 0, 0, Math.max(rx, ry));
            g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.55, 'rgba(0,0,0,0)');
            g.addColorStop(0.85, hexToRgba('#0a0610', 0.28)); g.addColorStop(1, hexToRgba('#0a0610', 0.6));
            c.fillStyle = g; c.fillRect(-rx, -ry, rx * 2, ry * 2);
            c.lineCap = 'round';
            const strands = (n, fn) => {
                for (let i = 0; i < n; i++) {
                    const u = (i + 0.5) / n * 2 - 1, odd = i % 3;
                    c.strokeStyle = odd === 1 ? mid : dark; c.globalAlpha = odd === 1 ? 0.3 : 0.5; c.lineWidth = odd === 1 ? 0.45 : 0.35;
                    c.beginPath(); fn(u); c.stroke();
                }
                c.globalAlpha = 1;
            };
            if (lie === 'sweep') strands(15, u => { c.moveTo(rx * 0.95, u * ry * 0.45); c.quadraticCurveTo(rx * 0.1, u * ry * 1.15, -rx * 1.05, u * ry * 1.05); });
            else if (lie === 'tie') strands(15, u => { c.moveTo(rx * 0.95, u * ry * 0.55); c.quadraticCurveTo(0, u * ry * 1.2, -rx * 0.92, u * 0.6); });
            else if (lie === 'part') strands(16, u => { const s = u < 0 ? -1 : 1, x = rx * (0.9 - Math.abs(u) * 1.9); c.moveTo(x, s * 0.4); c.quadraticCurveTo(x - 1, s * ry * 0.6, x - 3.5, s * ry * 1.05); });
            else {                                                      // coils: little C-curls packed over the crown
                for (let y = -ry; y <= ry; y += 2.3) for (let x = -rx; x <= rx; x += 2.3) {
                    const j = Math.sin(x * 12.9 + y * 78.2) * 0.8, a = (x * 7 + y * 3) % 6;
                    c.strokeStyle = (Math.round(x + y) & 1) ? mid : dark; c.globalAlpha = 0.5; c.lineWidth = 0.4;
                    c.beginPath(); c.arc(x + j, y - j * 0.5, 0.9, a, a + 3.6); c.stroke();
                }
                c.globalAlpha = 1;
            }
            // Sheen: a soft band across the crown toward the face, brightest in its middle
            const band = (w, a) => {
                c.strokeStyle = lift; c.globalAlpha = a; c.lineWidth = w;
                c.beginPath();
                if (lie === 'coil') c.ellipse(rx * 0.15, 0, rx * 0.5, ry * 0.55, 0, -1.2, 1.2);
                else c.ellipse(rx * 0.05, 0, rx * 0.55, ry * 0.68, 0, -1.05, 1.05);
                c.stroke();
            };
            band(2.6, 0.12); band(1.5, 0.2); band(0.6, lie === 'coil' ? 0.25 : 0.38);
            c.globalAlpha = 1;
            _hairFinishSprites.set(key, cv);
            return cv;
        }
        /** A small tile of hair texture (coils, or fine swept strands), baked per colour for the lobes and ruffles. */
        const _hairPatterns = new Map();
        const _hairTiles = new Map();
        function _hairPattern(ctx, kind, color) {
            const key = kind + color;
            let p = _hairPatterns.get(key);
            if (p) return p;
            p = ctx.createPattern(_hairPatternTile(kind, color), 'repeat');
            p.setTransform(new DOMMatrix([1 / HAIR_FINISH_K, 0, 0, 1 / HAIR_FINISH_K, 0, 0]));
            _hairPatterns.set(key, p);
            return p;
        }
        function _hairPatternTile(kind, color) {
            const key = kind + color;
            let cv = _hairTiles.get(key);
            if (cv) return cv;
            const K = HAIR_FINISH_K, U = 6;
            cv = document.createElement('canvas');
            cv.width = cv.height = U * K;
            const c = cv.getContext('2d'), luma = _hairLuma(color);
            const dark = _hairShade(color, 0.5), mid = lightenHex(color, luma < 0.25 ? 45 : 28);
            c.scale(K, K); c.lineCap = 'round'; c.lineWidth = 0.4;
            if (kind === 'coil') {
                const P = [[1.2, 1.3, 0.3], [4.2, 1.6, 2.1], [2.7, 4.3, 4.0], [5.6, 4.6, 1.2], [0.2, 4.6, 5.0]];
                for (let i = 0; i < P.length; i++) {
                    const [x, y, a] = P[i];
                    c.strokeStyle = i % 2 ? mid : dark; c.globalAlpha = i % 2 ? 0.35 : 0.55;
                    for (const dx of [0, -U, U]) for (const dy of [0, -U, U]) { c.beginPath(); c.arc(x + dx, y + dy, 0.9, a, a + 3.6); c.stroke(); }
                }
            } else {                                                    // fine strands lying back along -x, a little wavy
                for (let i = 0; i < 5; i++) {
                    const y = (i + 0.5) * U / 5;
                    c.strokeStyle = i % 2 ? mid : dark; c.globalAlpha = i % 2 ? 0.3 : 0.5; c.lineWidth = i % 2 ? 0.45 : 0.35;
                    c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(U * 0.33, y - 0.35, U * 0.66, y + 0.35, U, y); c.stroke();
                }
            }
            _hairTiles.set(key, cv);
            return cv;
        }
        /** Is this point outside the crown ellipse (where the crown's own finish doesn't reach)? */
        function _offCrown(p, cx, cy, C) { return ((p.x - cx) / C[1]) ** 2 + ((p.y - cy) / C[2]) ** 2 >= 1; }
        /**
         * Strand lines along a lock, off its centre line by `off` (in units of its half-width w0→w1),
         * only where it lies outside the crown. Adds to the current path.
         */
        function _hairFiber(ctx, st, off, w0, w1, cx, cy, C, from = 1) {
            let pen = false;
            const n = st.length - 1;
            for (let i = from; i <= n; i++) {
                const p = st[i];
                if (!_offCrown(p, cx, cy, C)) { pen = false; continue; }
                const a = st[Math.max(0, i - 1)], b = st[Math.min(n, i + 1)];
                const dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy) || 1;
                const w = (w0 + (w1 - w0) * (i / n)) * 0.5 * off;
                const x = p.x - dy / m * w, y = p.y + dx / m * w;
                if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
            }
        }
        /** Clip to a set of circles [x, y, r] and fill them with a texture tile, then mark where they meet. */
        function _hairLobes(ctx, lobes, pattern, edge) {
            ctx.save();
            ctx.beginPath();
            for (const [x, y, r] of lobes) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
            ctx.clip();
            ctx.fillStyle = pattern;
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (const [x, y, r] of lobes) { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); }
            ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
            if (!edge) { ctx.restore(); return; }
            // Each lobe's rim shades where it tucks under its neighbours: clusters, not one blob
            ctx.strokeStyle = edge; ctx.lineWidth = 0.9; ctx.globalAlpha *= 0.4;
            ctx.beginPath();
            for (const [x, y, r] of lobes) { ctx.moveTo(x + r - 0.3, y); ctx.arc(x, y, r - 0.3, 0, Math.PI * 2); }
            ctx.stroke();
            ctx.restore();
        }
        /** The rest of each style beyond the crown: curtains, tails, locks, braids, lobes and ruffles. */
        function _hairSecondary(ctx, type, color, headX, geo, cx, cy, C) {
            const S = geo.strands, j = geo.jig || { x: 0, y: 0 }, a0 = ctx.globalAlpha, luma = _hairLuma(color);
            const dark = _hairShade(color, 0.5), mid = lightenHex(color, luma < 0.25 ? 45 : 28), lift = lightenHex(color, luma < 0.25 ? 80 : 50);
            const lines = (style, a, w, fn) => { ctx.strokeStyle = style; ctx.lineWidth = w; ctx.globalAlpha = a0 * a; ctx.beginPath(); fn(); ctx.stroke(); };
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            if (type === 'long' && S.length > 1) {
                // The curtain between the locks gets its own strands, and darkens at its outer edges
                const n = S[0].length, tmp = _hairSecondary.tmp || (_hairSecondary.tmp = []);
                const between = (t) => {
                    for (let s = 0; s < S.length - 1; s++) {
                        const A = S[s], B = S[s + 1];
                        for (let i = 0; i < n; i++) { const q = tmp[i] || (tmp[i] = { x: 0, y: 0 }); q.x = A[i].x + (B[i].x - A[i].x) * t; q.y = A[i].y + (B[i].y - A[i].y) * t; }
                        tmp.length = n;
                        _hairFiber(ctx, tmp, 0, 1, 1, cx, cy, C);
                    }
                };
                lines(dark, 0.45, 0.4, () => { between(0.33); between(0.66); for (const st of S) _hairFiber(ctx, st, 0.5, 4, 3, cx, cy, C); });
                lines(mid, 0.3, 0.45, () => { between(0.5); for (const st of S) _hairFiber(ctx, st, -0.4, 4, 3, cx, cy, C); });
                lines(dark, 0.35, 2.2, () => { _hairFiber(ctx, S[0], 0.6, 4, 3, cx, cy, C); _hairFiber(ctx, S[S.length - 1], -0.6, 4, 3, cx, cy, C); });
            } else if (type === 'ponytail' || type === 'demon_dancer' || type === 'dreadlocks') {
                const w0 = type === 'ponytail' ? 5 : type === 'dreadlocks' ? 4 : 4.4, w1 = type === 'ponytail' ? 3 : type === 'dreadlocks' ? 3.2 : 0.8;
                lines(dark, 0.5, 0.4, () => { for (const st of S) { _hairFiber(ctx, st, 0.7, w0, w1, cx, cy, C); if (type === 'ponytail') _hairFiber(ctx, st, -0.2, w0, w1, cx, cy, C); } });
                lines(mid, 0.32, 0.45, () => { for (const st of S) { _hairFiber(ctx, st, -0.6, w0, w1, cx, cy, C); if (type === 'ponytail') _hairFiber(ctx, st, 0.25, w0, w1, cx, cy, C); } });
                if (type === 'dreadlocks') lines(dark, 0.45, 0.6, () => {    // the locks' twisted bands
                    for (const st of S) for (let i = 1; i < st.length; i++) {
                        const p = st[i];
                        if (!_offCrown(p, cx, cy, C)) continue;
                        const a = st[i - 1], dx = p.x - a.x, dy = p.y - a.y, m = Math.hypot(dx, dy) || 1, w = (4 - 0.8 * i / st.length) * 0.45;
                        const mx = (a.x + p.x) / 2, my = (a.y + p.y) / 2;
                        ctx.moveTo(mx - dy / m * w - dx / m * 0.5, my + dx / m * w - dy / m * 0.5); ctx.lineTo(mx + dy / m * w + dx / m * 0.5, my - dx / m * w + dy / m * 0.5);
                    }
                });
                if (type === 'ponytail') lines(dark, 0.4, 1.6, () => { for (const st of S) _hairFiber(ctx, st, 0.75, 5, 3, cx, cy, C, 0); });
            } else if (type === 'braids') {
                // Each plait catches a little light on its crest and a strand line down its middle
                const stride = 1;
                lines(lift, 0.3, 0.7, () => {
                    for (const st of S) for (let i = 1; i < st.length; i += stride) {
                        const a = st[i - 1], b = st[i], ang = Math.atan2(b.y - a.y, b.x - a.x) + (i % 2 ? 0.5 : -0.5);
                        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                        if (!_offCrown({ x: mx, y: my }, cx, cy, C)) continue;
                        const ux = Math.cos(ang), uy = Math.sin(ang);
                        ctx.moveTo(mx - ux * 1.1 - uy * 0.5, my - uy * 1.1 + ux * 0.5); ctx.lineTo(mx + ux * 0.6 - uy * 0.5, my + uy * 0.6 + ux * 0.5);
                    }
                });
            } else if (type === 'afro') {
                const hx = headX - 3 + j.x, hy = j.y;
                _hairLobes(ctx, [[hx, hy, 11], [hx + 2 + j.x * 0.4, -8 + hy * 1.3, 7], [hx - 6 + j.x * 0.4, -3 + hy * 1.2, 8], [hx - 2 + j.x * 0.4, 7 + hy * 1.3, 7]],
                    _hairPattern(ctx, 'coil', color), dark);
            } else if (type === 'curls') {
                const lobes = _hairSecondary.curls || (_hairSecondary.curls = _HAIR_CURL_RING.map(() => [0, 0, 0]));
                _HAIR_CURL_RING.forEach((c, i) => { const L = lobes[i]; L[0] = headX - 1 + c.x + j.x * c.bounce; L[1] = c.y + j.y * c.bounce; L[2] = c.r; });
                _hairLobes(ctx, lobes, _hairPattern(ctx, 'coil', color), dark);
            } else if (type === 'short') {
                _hairLobes(ctx, [[headX - 7 + j.x, -3 + j.y, 4], [headX - 7 + j.x, 3 + j.y, 3.5], [headX + 5, -3, 3.5], [headX + 5, 3, 3], [headX - 8 + j.x, j.y, 4.2]],
                    _hairPattern(ctx, 'fiber', color), null);            // tucked under the crown: no cluster rims
            }
            ctx.globalAlpha = a0; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
        }
        function _hairFinish(ctx, hair, headX, geo) {
            const C = HAIR_CROWNS[hair.type], color = hair.color || (hair.type === 'demon_dancer' ? '#0a0000' : null);
            if (!C || !color || !/^#[0-9a-f]{6}$/i.test(color)) return;
            const j = geo.jig, cx = headX + C[0] + (j ? j.x * C[4] : 0), cy = j ? j.y * C[4] : 0;
            _hairSecondary(ctx, hair.type, color, headX, geo, cx, cy, C);
            // Sheen down the loose strands, from where they leave the crown
            if (geo.strands.length && C[3] !== 'coil') {
                const a0 = ctx.globalAlpha, lift = lightenHex(color, _hairLuma(color) < 0.25 ? 80 : 50);
                ctx.strokeStyle = lift; ctx.lineCap = 'round'; ctx.lineWidth = 0.8;
                ctx.beginPath();
                for (let s = 0; s < geo.strands.length; s++) {
                    if (geo.strands.length > 2 && s % 2) continue;
                    const st = geo.strands[s];
                    let k = 1;
                    while (k < st.length && ((st[k].x - cx) / C[1]) ** 2 + ((st[k].y - cy) / C[2]) ** 2 < 1) k++;
                    if (k >= st.length - 1) continue;
                    const end = Math.min(st.length - 1, k + Math.ceil((st.length - k) * 0.55));
                    ctx.moveTo(st[k].x, st[k].y);
                    for (let i = k + 1; i <= end; i++) ctx.lineTo(st[i].x, st[i].y);
                }
                ctx.globalAlpha = a0 * 0.22; ctx.stroke();
                ctx.globalAlpha = a0; ctx.lineCap = 'butt';
            }
            const sp = _hairFinishSprite(hair.type, color), K = HAIR_FINISH_K;
            ctx.drawImage(sp, cx - sp.width / (2 * K), cy - sp.height / (2 * K), sp.width / K, sp.height / K);
        }

        // ════════════════════════════════════════════════════════════════════════
        //  PORTRAIT RENDERER — Front-facing bust portrait for sidebar & UI
        //  Uses same appearance config as drawProceduralHumanoid.
        //  PORTRAIT_HAIR_RENDERERS mirrors HAIR_RENDERERS but front-facing.
        // ════════════════════════════════════════════════════════════════════════

        const PORTRAIT_HAIR_RENDERERS = {
            // Each renderer: (ctx, color, cx, cy, fw, fh)
            //   cx, cy = face center;  fw, fh = face width/height radii

            afro_back(ctx, color, cx, cy, fw, fh) {
                // Full afro volume rendered BEHIND the face
                ctx.fillStyle = color;
                const r = Math.max(fw, fh) * 1.45;
                ctx.beginPath(); ctx.arc(cx, cy - fh * 0.15, r, 0, Math.PI * 2); ctx.fill();
                // A cloud, not a ball: soft bumps round its edge
                for (let i = 0; i < 16; i++) {
                    const a = i / 16 * Math.PI * 2 + 0.2, br = r * (0.2 + (i % 3) * 0.035);
                    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.9, cy - fh * 0.15 + Math.sin(a) * r * 0.9, br, 0, Math.PI * 2); ctx.fill();
                }
                // Side volume clusters (visible around face edges)
                const clusters = [
                    [cx - fw * 1.1, cy - fh * 0.1, r * 0.3],
                    [cx + fw * 1.1, cy - fh * 0.1, r * 0.3],
                    [cx - fw * 1.0, cy + fh * 0.4, r * 0.28],
                    [cx + fw * 1.0, cy + fh * 0.4, r * 0.28],
                    [cx - fw * 0.9, cy - fh * 0.8, r * 0.35],
                    [cx + fw * 0.9, cy - fh * 0.8, r * 0.35],
                    [cx, cy - fh * 1.35, r * 0.4],
                    [cx - fw * 0.5, cy - fh * 1.2, r * 0.32],
                    [cx + fw * 0.5, cy - fh * 1.2, r * 0.32],
                ];
                for (const [x, y, cr] of clusters) {
                    ctx.beginPath(); ctx.arc(x, y, cr, 0, Math.PI * 2); ctx.fill();
                }
            },

            afro(ctx, color, cx, cy, fw, fh) {
                // FRONT layer — only the top crown above the forehead
                ctx.fillStyle = color;
                // Crown arc sitting on top of head, meeting the forehead in a rounded hairline (lower at the temples)
                ctx.beginPath();
                ctx.ellipse(cx, cy - fh * 0.85, fw * 1.25, fh * 0.55, 0, Math.PI, Math.PI * 2);
                ctx.lineTo(cx + fw * 1.0, cy - fh * 0.38);
                ctx.quadraticCurveTo(cx, cy - fh * 1.3, cx - fw * 1.0, cy - fh * 0.38);
                ctx.closePath();
                ctx.fill();
                // Texture clusters on top only
                const topClusters = [
                    [cx, cy - fh * 1.3, fw * 0.38],
                    [cx - fw * 0.55, cy - fh * 1.15, fw * 0.3],
                    [cx + fw * 0.55, cy - fh * 1.15, fw * 0.3],
                    [cx - fw * 0.9, cy - fh * 0.8, fw * 0.28],
                    [cx + fw * 0.9, cy - fh * 0.8, fw * 0.28],
                ];
                for (const [x, y, cr] of topClusters) {
                    ctx.beginPath(); ctx.arc(x, y, cr, 0, Math.PI * 2); ctx.fill();
                }
            },

            curls(ctx, color, cx, cy, fw, fh) {
                ctx.fillStyle = color;
                // Volume cap on top
                ctx.beginPath();
                ctx.ellipse(cx, cy - fh * 0.7, fw * 1.15, fh * 0.6, 0, 0, Math.PI * 2);
                ctx.fill();
                // Side curls framing face
                const curlPositions = [
                    // Left side
                    [cx - fw * 1.0, cy - fh * 0.3, fw * 0.32],
                    [cx - fw * 1.05, cy + fh * 0.1, fw * 0.30],
                    [cx - fw * 0.95, cy + fh * 0.5, fw * 0.28],
                    [cx - fw * 0.82, cy + fh * 0.85, fw * 0.25],
                    // Right side
                    [cx + fw * 1.0, cy - fh * 0.3, fw * 0.32],
                    [cx + fw * 1.05, cy + fh * 0.1, fw * 0.30],
                    [cx + fw * 0.95, cy + fh * 0.5, fw * 0.28],
                    [cx + fw * 0.82, cy + fh * 0.85, fw * 0.25],
                    // Top clusters
                    [cx - fw * 0.5, cy - fh * 1.0, fw * 0.3],
                    [cx + fw * 0.5, cy - fh * 1.0, fw * 0.3],
                    [cx, cy - fh * 1.1, fw * 0.28],
                ];
                for (const [x, y, r] of curlPositions) {
                    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
                }
            },

            long(ctx, color, cx, cy, fw, fh) {
                ctx.fillStyle = color;
                // Top volume
                ctx.beginPath();
                ctx.ellipse(cx, cy - fh * 0.6, fw * 1.1, fh * 0.55, 0, 0, Math.PI * 2);
                ctx.fill();
                // Left cascade
                ctx.beginPath();
                ctx.moveTo(cx - fw * 0.9, cy - fh * 0.6);
                ctx.quadraticCurveTo(cx - fw * 1.3, cy + fh * 0.5, cx - fw * 0.9, cy + fh * 1.6);
                ctx.lineTo(cx - fw * 0.5, cy + fh * 1.5);
                ctx.quadraticCurveTo(cx - fw * 0.7, cy + fh * 0.3, cx - fw * 0.7, cy - fh * 0.3);
                ctx.closePath();
                ctx.fill();
                // Right cascade
                ctx.beginPath();
                ctx.moveTo(cx + fw * 0.9, cy - fh * 0.6);
                ctx.quadraticCurveTo(cx + fw * 1.3, cy + fh * 0.5, cx + fw * 0.9, cy + fh * 1.6);
                ctx.lineTo(cx + fw * 0.5, cy + fh * 1.5);
                ctx.quadraticCurveTo(cx + fw * 0.7, cy + fh * 0.3, cx + fw * 0.7, cy - fh * 0.3);
                ctx.closePath();
                ctx.fill();
            },

            short(ctx, color, cx, cy, fw, fh) {
                ctx.fillStyle = color;
                // Close-fitting cap
                ctx.beginPath();
                ctx.ellipse(cx, cy - fh * 0.45, fw * 1.08, fh * 0.7, 0, 0, Math.PI * 2);
                ctx.fill();
                // Side texture
                ctx.beginPath(); ctx.arc(cx - fw * 0.85, cy - fh * 0.1, fw * 0.22, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(cx + fw * 0.85, cy - fh * 0.1, fw * 0.22, 0, Math.PI * 2); ctx.fill();
                // Top texture
                ctx.beginPath(); ctx.arc(cx - fw * 0.3, cy - fh * 0.95, fw * 0.2, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(cx + fw * 0.3, cy - fh * 0.95, fw * 0.2, 0, Math.PI * 2); ctx.fill();
            },

            braids(ctx, color, cx, cy, fw, fh) {
                ctx.fillStyle = color;
                // Top volume (pulled back, less poofy)
                ctx.beginPath();
                ctx.ellipse(cx, cy - fh * 0.55, fw * 1.05, fh * 0.55, 0, 0, Math.PI * 2);
                ctx.fill();
                // Left braid
                ctx.lineWidth = fw * 0.2;
                ctx.strokeStyle = color;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(cx - fw * 0.75, cy - fh * 0.1);
                ctx.quadraticCurveTo(cx - fw * 1.0, cy + fh * 0.6, cx - fw * 0.7, cy + fh * 1.4);
                ctx.stroke();
                // Right braid
                ctx.beginPath();
                ctx.moveTo(cx + fw * 0.75, cy - fh * 0.1);
                ctx.quadraticCurveTo(cx + fw * 1.0, cy + fh * 0.6, cx + fw * 0.7, cy + fh * 1.4);
                ctx.stroke();
                // Braid texture bumps
                for (let i = 0; i < 4; i++) {
                    const t = 0.2 + i * 0.22;
                    const ly = cy - fh * 0.1 + (fh * 1.5) * t;
                    const lx = cx - fw * 0.75 - Math.sin(t * 3) * fw * 0.15;
                    const rx = cx + fw * 0.75 + Math.sin(t * 3) * fw * 0.15;
                    ctx.beginPath(); ctx.arc(lx, ly, fw * 0.12, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(rx, ly, fw * 0.12, 0, Math.PI * 2); ctx.fill();
                }
                ctx.lineCap = 'butt';
            },

            dreadlocks(ctx, color, cx, cy, fw, fh) {
                ctx.fillStyle = color;
                // Head coverage
                ctx.beginPath();
                ctx.ellipse(cx, cy - fh * 0.45, fw * 1.1, fh * 0.65, 0, 0, Math.PI * 2);
                ctx.fill();
                // Individual locs hanging down
                ctx.lineWidth = fw * 0.16;
                ctx.strokeStyle = color;
                ctx.lineCap = 'round';
                const locs = [
                    { sx: -0.9, sy: -0.2, ex: -1.1, ey: 1.3 },
                    { sx: -0.7, sy: 0.0,  ex: -0.9, ey: 1.5 },
                    { sx: -0.5, sy: 0.1,  ex: -0.55, ey: 1.4 },
                    { sx: 0.9,  sy: -0.2, ex: 1.1,  ey: 1.3 },
                    { sx: 0.7,  sy: 0.0,  ex: 0.9,  ey: 1.5 },
                    { sx: 0.5,  sy: 0.1,  ex: 0.55, ey: 1.4 },
                    // Back locs peeking out on sides
                    { sx: -1.05, sy: -0.4, ex: -1.25, ey: 1.0 },
                    { sx: 1.05,  sy: -0.4, ex: 1.25,  ey: 1.0 },
                ];
                for (const loc of locs) {
                    ctx.beginPath();
                    ctx.moveTo(cx + fw * loc.sx, cy + fh * loc.sy);
                    ctx.quadraticCurveTo(
                        cx + fw * (loc.sx + loc.ex) * 0.55, cy + fh * (loc.sy + loc.ey) * 0.6,
                        cx + fw * loc.ex, cy + fh * loc.ey
                    );
                    ctx.stroke();
                }
                ctx.lineCap = 'butt';
            },

            ponytail(ctx, color, cx, cy, fw, fh) {
                ctx.fillStyle = color;
                // Sleek pulled-back top — tight to head
                ctx.beginPath();
                ctx.ellipse(cx, cy - fh * 0.5, fw * 1.05, fh * 0.6, 0, 0, Math.PI * 2);
                ctx.fill();
                // Slight part line
                ctx.strokeStyle = ctx.fillStyle;
                ctx.lineWidth = 1;
                // Ponytail peeking behind on one side
                ctx.lineWidth = fw * 0.22;
                ctx.strokeStyle = color;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(cx + fw * 0.3, cy - fh * 0.85);
                ctx.bezierCurveTo(
                    cx + fw * 0.8, cy - fh * 1.2,
                    cx + fw * 1.2, cy - fh * 0.5,
                    cx + fw * 1.0, cy + fh * 0.3
                );
                ctx.stroke();
                ctx.lineCap = 'butt';
            },

            demon_dancer(ctx, color, cx, cy, fw, fh) {
                const c = color || '#0a0000';
                ctx.fillStyle = c;
                // Wild volume on top
                ctx.beginPath();
                ctx.ellipse(cx, cy - fh * 0.6, fw * 1.2, fh * 0.65, 0, 0, Math.PI * 2);
                ctx.fill();
                // Tendrils flying outward
                ctx.strokeStyle = c;
                ctx.lineWidth = fw * 0.14;
                ctx.lineCap = 'round';
                const tendrils = [
                    { sx: -0.8, sy: -0.7, cx1: -1.8, cy1: -1.0, ex: -2.0, ey: -0.3 },
                    { sx: 0.8,  sy: -0.7, cx1: 1.8,  cy1: -1.0, ex: 2.0,  ey: -0.3 },
                    { sx: -0.6, sy: -0.9, cx1: -1.5, cy1: -1.5, ex: -1.6, ey: -0.8 },
                    { sx: 0.6,  sy: -0.9, cx1: 1.5,  cy1: -1.5, ex: 1.6,  ey: -0.8 },
                    { sx: -0.9, sy: -0.2, cx1: -1.6, cy1: 0.0,  ex: -1.8, ey: 0.8 },
                    { sx: 0.9,  sy: -0.2, cx1: 1.6,  cy1: 0.0,  ex: 1.8,  ey: 0.8 },
                ];
                for (const t of tendrils) {
                    ctx.beginPath();
                    ctx.moveTo(cx + fw * t.sx, cy + fh * t.sy);
                    ctx.quadraticCurveTo(cx + fw * t.cx1, cy + fh * t.cy1, cx + fw * t.ex, cy + fh * t.ey);
                    ctx.stroke();
                }
                // Secondary wisps
                ctx.globalAlpha = 0.5;
                ctx.lineWidth = fw * 0.08;
                ctx.beginPath();
                ctx.moveTo(cx - fw * 1.0, cy - fh * 0.5);
                ctx.quadraticCurveTo(cx - fw * 2.2, cy - fh * 0.2, cx - fw * 2.0, cy + fh * 0.6);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(cx + fw * 1.0, cy - fh * 0.5);
                ctx.quadraticCurveTo(cx + fw * 2.2, cy - fh * 0.2, cx + fw * 2.0, cy + fh * 0.6);
                ctx.stroke();
                ctx.globalAlpha = 1.0;
                ctx.lineCap = 'butt';
            }
        };

        /**
         * Draws a front-facing character portrait (bust/head).
         * Works for player (via cosmetics) and NPCs (via appearance config).
         * 
         * @param {CanvasRenderingContext2D} ctx
         * @param {number} w - Canvas width
         * @param {number} h - Canvas height
         * @param {Object} config
         *   @param {string} config.skinColor - Hex skin color
         *   @param {Object} config.hair - { type, color }
         *   @param {string} [config.eyeColor='#daa520'] - Iris color
         *   @param {string} [config.gender='female']
         *   @param {Object} [config.top] - Clothing top { type, color }
         */
        /** Convert hex color to {r, g, b} object. */
        function hexToRGB(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 200, g: 150, b: 100 };
        }

        /* ── Portrait light ── Portraits are lit like the room they're seen in: a soft key from the
           upper right, and a rim of the nearest lamp's colour round the left edge of the face, hair and
           shoulders (red in the palace, violet under Neural Systems' trees). Each part (body, face,
           hair) is drawn flat into its own layer, then shaded inside its own shape ('source-atop'),
           so every wardrobe piece and hair style picks the light up without knowing about it. */
        const _portraitLayers = [];
        function _portraitLayer(i, w, h) {
            let c = _portraitLayers[i];
            if (!c) c = _portraitLayers[i] = document.createElement('canvas');
            if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
            const x = c.getContext('2d');
            x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
            x.clearRect(0, 0, w, h);
            return c;
        }
        /** The rim colour ('r, g, b') for portraits right now: the lamp nearest the player, else a warm neon. */
        function portraitRimRGB(config) {
            if (config && config.rim) return config.rim;
            try {
                // Of the lamps near the player, the most colourful wins (a near white downlight shouldn't
                // drown out the violet trees beside it); nearer counts for more
                const p = game.player, cells = p && _lampCells(), R = 420;
                let best = null, bs = 0;
                if (cells) {
                    const gx = Math.floor(p.x / 200), gy = Math.floor(p.y / 200);
                    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
                        const c = cells.get((gx + i) + ',' + (gy + j));
                        if (c) for (const l of c) {
                            if (!/^#[0-9a-f]{6}$/i.test(l.color || '')) continue;
                            const d = Math.hypot(l.x - p.x, l.y - p.y);
                            if (d >= R) continue;
                            const n = parseInt(l.color.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
                            const sc = (0.15 + (Math.max(r, g, b) - Math.min(r, g, b)) / 255) * Math.sqrt(1 - d / R);
                            if (sc > bs) { bs = sc; best = l.color; }
                        }
                    }
                }
                if (best) return _portraitVivid(best);
            } catch (e) { }
            return '255, 120, 150';
        }
        /** Pale lamp colours read as white on a face: push them toward their own hue. */
        const _vividRims = new Map();
        function _portraitVivid(hex) {
            let v = _vividRims.get(hex);
            if (v) return v;
            const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255], hi = Math.max(...c), lo = Math.min(...c);
            const k = hi - lo < 90 ? 1.9 : 1.2, mean = (c[0] + c[1] + c[2]) / 3;
            v = c.map(x => Math.max(0, Math.min(255, Math.round(mean + (x - mean) * k + (255 - hi) * 0.5)))).join(', ');
            _vividRims.set(hex, v);
            return v;
        }
        /** Fill the whole layer with a gradient or colour, only where the layer already has paint. */
        function _pAtop(x, w, h, style, a = 1) {
            x.globalCompositeOperation = 'source-atop'; x.globalAlpha = a;
            x.fillStyle = style; x.fillRect(0, 0, w, h);
            x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
        }
        /** A soft spot (radial, colour → clear) of radius r at x, y; stretched by sx/sy. */
        function _pSpot(x, w, h, px, py, rx, ry, rgb, a) {
            x.save(); x.translate(px, py); x.scale(1, ry / rx);
            const g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
            g.addColorStop(0, `rgba(${rgb}, ${a})`); g.addColorStop(1, `rgba(${rgb}, 0)`);
            x.globalCompositeOperation = 'source-atop'; x.fillStyle = g; x.fillRect(-rx, -rx, rx * 2, rx * 2);
            x.restore();
        }
        /** A rim of light along the left edge of whatever the layer holds, d px deep: the shape, less
         *  itself shifted right, is the edge that faces the light (soft: a wide faint band under a narrow one). */
        function _pRim(x, w, h, d, rgb, a) {
            const src = x.canvas;
            for (const [k, ka] of [[1, 0.22], [0.6, 0.4], [0.28, 0.85]]) {
                const t = _portraitLayer(4, w, h).getContext('2d');
                t.drawImage(src, 0, 0);
                t.globalCompositeOperation = 'source-in'; t.fillStyle = `rgb(${rgb})`; t.fillRect(0, 0, w, h);
                t.globalCompositeOperation = 'destination-out'; t.drawImage(src, d * k, d * k * 0.45);
                x.globalCompositeOperation = 'source-atop'; x.globalAlpha = a * ka;
                x.drawImage(t.canvas, 0, 0);
            }
            x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
        }
        const _P_SHADE = '24, 8, 20';
        /** Hair, shaded and textured in its layer: depth toward the edges, strands or coils, a sheen, the rim. */
        function _portraitHairFinish(x, w, h, hair, cx, cy, fw, fh, rim, rimA = 0.75) {
            const color = /^#[0-9a-f]{6}$/i.test(hair.color || '') ? hair.color : '#1a1a1a';
            const luma = _hairLuma(color), coily = hair.type === 'afro' || hair.type === 'curls';
            const dark = _hairShade(color, 0.55), mid = lightenHex(color, luma < 0.25 ? 50 : 30), lift = lightenHex(color, luma < 0.25 ? 110 : 70);
            // Depth: the crown nearest the light stays full; it falls into shadow at the edges and below
            const top = cy - fh * (coily ? 1.0 : 0.75);
            let g = x.createRadialGradient(cx + fw * 0.25, top, fw * 0.1, cx, cy - fh * 0.2, fw * 2.3);
            g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(${_P_SHADE}, 0.7)`);
            _pAtop(x, w, h, g);
            g = x.createLinearGradient(0, cy - fh * 0.2, 0, cy + fh * 1.7);
            g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(${_P_SHADE}, 0.5)`);
            _pAtop(x, w, h, g);
            x.globalCompositeOperation = 'source-atop'; x.lineCap = 'round';
            if (coily) {
                // Coils: a tile scaled to the face, then a few lit curls toward the key light
                const tile = _hairPatternTile('coil', color), s = fw * 0.17 / (6 * HAIR_FINISH_K);
                for (const [k, a] of [[1, 0.6], [0.77, 0.35]]) {             // two scales, offset: no visible repeat
                    const pat = x.createPattern(tile, 'repeat');
                    pat.setTransform(new DOMMatrix([s * k, s * k * 0.2 * (k < 1 ? 1 : 0), 0, s * k, fw * 0.37 * (1 - k), fh * 0.29 * (1 - k)]));
                    x.globalAlpha = a; x.fillStyle = pat; x.fillRect(0, 0, w, h);
                }
                x.globalAlpha = 1;
                x.strokeStyle = lift; x.lineWidth = Math.max(0.8, fw * 0.035);
                for (let i = 0; i < 26; i++) {
                    const a = i * 2.39996, r = fw * 1.3 * Math.sqrt((i + 0.5) / 26);
                    const px = cx + fw * 0.3 + Math.cos(a) * r, py = top + fh * 0.1 + Math.sin(a) * r * 0.75;
                    x.globalAlpha = 0.28 * (1 - r / (fw * 1.4));
                    x.beginPath(); x.arc(px, py, fw * 0.07, a, a + 2.6); x.stroke();
                }
            } else {
                // Strands: from the parting over the crown and down the sides, then the fall of long hair
                const px = cx + fw * 0.18, py = cy - fh * 1.12, N = 44;
                for (let i = 0; i < N; i++) {
                    const t = i / (N - 1), th = Math.PI * (0.82 + t * 1.36);
                    const ex = cx + Math.cos(th) * fw * 1.25, ey = cy - fh * 0.3 + Math.sin(th) * fh * 1.0 + fh * 0.25;
                    const kx = cx + Math.cos(th) * fw * 1.15 + (px - cx) * 0.4, ky = cy - fh * 0.75 + Math.sin(th) * fh * 0.55;
                    x.strokeStyle = i % 3 === 1 ? mid : dark; x.globalAlpha = i % 3 === 1 ? 0.22 : 0.3;
                    x.lineWidth = Math.max(0.6, fw * (i % 3 === 1 ? 0.03 : 0.022));
                    x.beginPath(); x.moveTo(px + (t - 0.5) * fw * 0.1, py); x.quadraticCurveTo(kx, ky, ex, ey); x.stroke();
                }
                for (let i = 0; i < 30; i++) {
                    const side = i % 2 ? 1 : -1, u = (i >> 1) / 14, x0 = cx + side * fw * (0.55 + u * 0.8);
                    x.strokeStyle = i % 3 ? dark : mid; x.globalAlpha = 0.28; x.lineWidth = Math.max(0.6, fw * 0.025);
                    x.beginPath(); x.moveTo(x0, cy - fh * 0.6);
                    x.bezierCurveTo(x0 + side * fw * 0.25, cy + fh * 0.2, x0 - side * fw * 0.1, cy + fh * 0.9, x0 + side * fw * 0.05, cy + fh * 1.8); x.stroke();
                }
                // Sheen: a soft band riding round the crown
                for (const [lw, a] of [[0.16, 0.12], [0.08, 0.2], [0.03, 0.35]]) {
                    x.strokeStyle = lift; x.globalAlpha = a; x.lineWidth = fw * lw;
                    x.beginPath(); x.ellipse(cx + fw * 0.08, cy - fh * 0.42, fw * 0.95, fh * 0.62, 0, Math.PI * 1.12, Math.PI * 1.78); x.stroke();
                }
            }
            x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
            _pRim(x, w, h, fw * 0.13, rim, rimA);
        }
        /** Draw a hair renderer with a darker rim round each piece it fills: curls read as clusters, not one blob. */
        function _portraitClusters(x, color, lw) {
            const edge = _hairShade(color, 0.45);
            return new Proxy(x, {
                get(t, k) {
                    if (k === 'fill') return (...a) => { t.fill(...a); t.save(); t.globalCompositeOperation = 'source-atop'; t.strokeStyle = edge; t.globalAlpha = 0.5; t.lineWidth = lw; t.stroke(); t.restore(); };
                    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
                },
                set(t, k, v) { t[k] = v; return true; }
            });
        }
        /** Draw one portrait hair layer (renderer key) through its own lit layer onto ctx. */
        /** The face's outline (forehead, temples, cheekbones, jaw, chin) added to the current path; k narrows it. */
        function portraitFacePath(c, cx, cy, fw, fh, k = 1) {
            c.moveTo(cx, cy - fh);
            for (const s of [1, -1]) {
                const X = v => cx + s * v * fw * k;
                if (s < 0) c.moveTo(cx, cy - fh);
                c.bezierCurveTo(X(0.62), cy - fh, X(0.95), cy - fh * 0.72, X(0.98), cy - fh * 0.3);      // forehead to temple
                c.bezierCurveTo(X(1.0), cy + fh * 0.05, X(0.97), cy + fh * 0.3, X(0.86), cy + fh * 0.55);  // cheekbone to the jaw's angle
                c.bezierCurveTo(X(0.72), cy + fh * 0.82, X(0.42), cy + fh * 1.02, cx, cy + fh * 1.04);      // jaw to chin
            }
        }
        /**
         * Draw one portrait hair layer (renderer key) through its own lit layer onto ctx.
         * opts.front: the layer lies over the face, so it's cut away inside the face's outline below an
         * arch at the brow (a fringe stays; side curtains frame the temples instead of cutting into the cheeks).
         */
        function _portraitHair(ctx, key, hair, cx, cy, fw, fh, w, h, rim, layer, opts = {}) {
            const renderer = PORTRAIT_HAIR_RENDERERS[key];
            if (!renderer) return;
            const L = _portraitLayer(layer, w, h), x = L.getContext('2d');
            renderer(hair.type === 'curls' ? _portraitClusters(x, /^#[0-9a-f]{6}$/i.test(hair.color || '') ? hair.color : '#1a1a1a', Math.max(1, fw * 0.05)) : x, hair.color, cx, cy, fw, fh);
            if (opts.front) {
                x.save();
                x.beginPath(); x.rect(0, cy + fh * 0.2, w, h);                 // below the cheekbones, and an arch up to the brow
                x.ellipse(cx, cy + fh * 0.2, fw * 0.95, fh * 0.6, 0, 0, Math.PI * 2); x.clip('nonzero');
                x.globalCompositeOperation = 'destination-out';
                x.beginPath(); portraitFacePath(x, cx, cy, fw, fh, 0.94); x.fill();
                x.restore();
            }
            _portraitHairFinish(x, w, h, hair, cx, cy, fw, fh, rim, opts.front ? 0.35 : 0.75);
            ctx.drawImage(L, 0, 0, w, h);
        }

        function drawCharacterPortraitClassic(ctx, w, h, config) {
            const A = androidLook(config.body);                              // Double Nights android (ui/bodies.js)
            const me = APPEARANCES['949'];                                   // unset parts default to Stella's
            const skinColor = A ? A.plate : (config.skinColor || me.skinColor);
            const hair = A ? (config.hair || null) : (config.hair || me.hair);
            const eyeColor = config.eyeColor || me.eyeColor;
            const gender = config.gender || me.gender;
            const top = config.top || null;
            // Expression (ui/expressions.js): every number is 0 for the neutral face
            const X = resolveExpression(config.expression);
            const blink = config.blink || 0, talk = config.talk || 0;

            // Derived colors from skin
            const skinRGB = hexToRGB(skinColor);
            const shadowColor = `rgb(${Math.max(0, skinRGB.r - 35)}, ${Math.max(0, skinRGB.g - 30)}, ${Math.max(0, skinRGB.b - 25)})`;
            const highlightColor = `rgb(${Math.min(255, skinRGB.r + 20)}, ${Math.min(255, skinRGB.g + 15)}, ${Math.min(255, skinRGB.b + 10)})`;
            // Lips: the skin's own tone leaning rose (deeper on the upper lip)
            const lipMix = (r, g, b, k) => `rgb(${Math.round(skinRGB.r + (r - skinRGB.r) * k)}, ${Math.round(skinRGB.g + (g - skinRGB.g) * k)}, ${Math.round(skinRGB.b + (b - skinRGB.b) * k)})`;
            const lipColor = lipMix(184, 74, 92, 0.38);
            const lipDark = lipMix(116, 36, 54, 0.45);

            // Layout proportions (relative to canvas)
            const cx = w * 0.5;      // Face center X
            const cy = h * 0.5;      // Face center Y
            const fw = w * 0.21;     // Face width radius (a close bust: the face fills the frame)
            const fh = h * 0.26;     // Face height radius (oval)
            const rim = portraitRimRGB(config);                               // the room's light round the left edge
            const skinLum = (0.3 * skinRGB.r + 0.59 * skinRGB.g + 0.11 * skinRGB.b) / 255;
            const SK = `${Math.round(skinRGB.r * 0.42)}, ${Math.round(skinRGB.g * 0.26)}, ${Math.round(skinRGB.b * 0.3)}`;   // skin's own shade, warm

            // ─── BACKDROP GLOW ─── the room's colour behind them, brightest on the rim side
            if (config.backdrop !== false) {
                ctx.save();
                ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); ctx.clip();
                let g = ctx.createRadialGradient(cx - fw * 1.5, cy - fh * 0.7, 0, cx - fw * 1.5, cy - fh * 0.7, w * 0.85);
                g.addColorStop(0, `rgba(${rim}, 0.55)`); g.addColorStop(0.5, `rgba(${rim}, 0.16)`); g.addColorStop(1, `rgba(${rim}, 0)`);
                ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
                g = ctx.createRadialGradient(cx, cy, w * 0.3, cx, cy, w * 0.72);
                g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
                ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
                ctx.restore();
            }

            // ─── HAIR (DEEP BACK — behind neck/shoulders) ───
            const hairBackFull = ['afro'];
            if (hair && hairBackFull.includes(hair.type)) _portraitHair(ctx, hair.type + '_back', hair, cx, cy, fw, fh, w, h, rim, 0);

            // ─── NECK ─── (neck, shoulders and neck jewelry go into their own layer, lit as one)
            const mainCtx = ctx;
            const bodyLayer = _portraitLayer(1, w, h);
            ctx = bodyLayer.getContext('2d');
            ctx.fillStyle = shadowColor;
            ctx.beginPath();
            ctx.moveTo(cx - fw * 0.4, cy + fh * 0.85);
            ctx.lineTo(cx - fw * 0.35, cy + fh * 1.6);
            ctx.lineTo(cx + fw * 0.35, cy + fh * 1.6);
            ctx.lineTo(cx + fw * 0.4, cy + fh * 0.85);
            ctx.closePath();
            ctx.fill();

            // ─── SHOULDERS / CLOTHING ───
            // Wardrobe pieces (ui/wardrobe.js) draw their own front view; anything else is a plain shape
            const WD = typeof WARDROBE !== 'undefined' ? WARDROBE : null;
            const bw = portraitBreadth(config);                               // shoulder breadth from the build
            const P = { cx, cy, fw, fh, w, h, eyeY: cy - fh * 0.15, eyeSpacing: fw * 0.44, bw };
            const jewelry = (config.jewelry || []).filter(j => WD && WD.jewelry[j.type]);
            const topPiece = WD && top ? WD.tops[top.type] : null;
            if (topPiece) {
                topPiece.portrait(ctx, P, top, shadowColor);
            } else {
            if (top) {
                ctx.fillStyle = top.color || '#222';
            } else {
                ctx.fillStyle = shadowColor;
            }
            ctx.beginPath();
            ctx.moveTo(cx - fw * 0.35, cy + fh * 1.4);
            ctx.quadraticCurveTo(cx - fw * 1.8 * bw, cy + fh * 1.6, cx - fw * 2.5 * bw, cy + fh * 2.8);
            ctx.lineTo(cx + fw * 2.5 * bw, cy + fh * 2.8);
            ctx.quadraticCurveTo(cx + fw * 1.8 * bw, cy + fh * 1.6, cx + fw * 0.35, cy + fh * 1.4);
            ctx.closePath();
            ctx.fill();
            // Collar line
            if (top) {
                ctx.strokeStyle = `rgba(255,255,255,0.08)`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(cx - fw * 0.35, cy + fh * 1.4);
                ctx.quadraticCurveTo(cx, cy + fh * 1.65, cx + fw * 0.35, cy + fh * 1.4);
                ctx.stroke();
            }
            }
            for (const j of jewelry) if (WD.jewelry[j.type].at === 'neck') WD.jewelry[j.type].portrait(ctx, P, j);
            {   // The chin shades the neck; the shoulders fall away from the light, the room catches their edge
                const b = ctx;
                _pSpot(b, w, h, cx, cy + fh * 1.02, fw * 0.8, fh * 0.42, SK, 0.75);
                let g = b.createLinearGradient(0, cy + fh * 1.3, 0, h);
                g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(${_P_SHADE}, 0.55)`);
                _pAtop(b, w, h, g);
                g = b.createLinearGradient(cx - fw * 2.4, 0, cx + fw * 2.4, 0);
                g.addColorStop(0, `rgba(${_P_SHADE}, 0.35)`); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(${_P_SHADE}, 0.15)`);
                _pAtop(b, w, h, g);
                _pSpot(b, w, h, cx + fw * 1.1, cy + fh * 1.75, fw * 0.9, fh * 0.35, '255, 244, 232', 0.12);
                _pRim(b, w, h, fw * 0.15, rim, 0.6);
                ctx = mainCtx;
                ctx.drawImage(bodyLayer, 0, 0, w, h);
            }
            // Earrings sit beneath both hair passes; the face covers their inner attachment.
            for (const j of jewelry) if (WD.jewelry[j.type].underHair) WD.jewelry[j.type].portrait(ctx, P, j);

            // ─── HAIR (BACK LAYER — behind face, over shoulders) ───
            const hairBackSoft = ['long', 'demon_dancer', 'dreadlocks'];
            if (hair && hairBackSoft.includes(hair.type)) {
                ctx.save();
                ctx.globalAlpha = 0.85;                                      // the far side of the hair, a touch dimmer
                _portraitHair(ctx, hair.type, hair, cx, cy, fw, fh, w, h, rim, 0);
                ctx.restore();
            }

            // ─── FACE ─── the oval and jaw in their own layer, modelled by the light
            {
                const faceLayer = _portraitLayer(2, w, h), f = faceLayer.getContext('2d');
                f.fillStyle = skinColor;
                f.beginPath(); portraitFacePath(f, cx, cy, fw, fh); f.fill();
                // Form: the face turns away from the key light on its left, the hairline and jaw shade
                let g = f.createLinearGradient(cx - fw, 0, cx + fw, 0);
                g.addColorStop(0, `rgba(${SK}, 0.42)`); g.addColorStop(0.3, `rgba(${SK}, 0.12)`);
                g.addColorStop(0.6, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(${SK}, 0.16)`);
                _pAtop(f, w, h, g);
                g = f.createLinearGradient(0, cy - fh, 0, cy - fh * 0.42);
                g.addColorStop(0, `rgba(${SK}, 0.5)`); g.addColorStop(1, 'rgba(0,0,0,0)');
                _pAtop(f, w, h, g);
                g = f.createLinearGradient(0, cy + fh * 0.5, 0, cy + fh * 1.08);
                g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(${SK}, 0.32)`);
                _pAtop(f, w, h, g);
                for (const side of [-1, 1]) {
                    _pSpot(f, w, h, cx + side * fw * 0.44, cy - fh * 0.18, fw * 0.3, fh * 0.15, SK, 0.2 * (1 - skinLum * 0.45));     // eye sockets
                    _pSpot(f, w, h, cx + side * fw * 0.74, cy + fh * 0.36, fw * 0.2, fh * 0.08, SK, 0.1 * (1 - skinLum * 0.7));    // under the cheekbones
                    _pSpot(f, w, h, cx + side * fw * 0.48, cy + fh * 0.1, fw * 0.26, fh * 0.12, '255, 240, 228', side > 0 ? 0.2 : 0.07);   // cheekbones
                }
                _pSpot(f, w, h, cx + fw * 0.12, cy - fh * 0.58, fw * 0.4, fh * 0.16, '255, 244, 234', 0.16);       // brow
                _pSpot(f, w, h, cx + fw * 0.03, cy - fh * 0.0, fw * 0.07, fh * 0.24, '255, 246, 238', 0.22);       // nose bridge
                _pSpot(f, w, h, cx + fw * 0.05, cy + fh * 0.88, fw * 0.17, fh * 0.08, '255, 244, 234', 0.14);      // chin
                _pRim(f, w, h, fw * 0.12, rim, 0.7);
                ctx.drawImage(faceLayer, 0, 0, w, h);
            }

            // Blush
            if (X.blush > 0) {
                ctx.fillStyle = `rgba(214, 72, 104, ${0.2 * X.blush})`;
                for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + side * fw * 0.5, cy + fh * 0.2, fw * 0.28, fh * 0.13, side * 0.15, 0, Math.PI * 2); ctx.fill(); }
            }

            // Age (config.age 0..1): fine lines at the eyes, the brow and round the mouth
            if (config.age && !A) {
                const k = Math.min(1, config.age);
                ctx.strokeStyle = `rgba(${Math.max(0, skinRGB.r - 60)}, ${Math.max(0, skinRGB.g - 55)}, ${Math.max(0, skinRGB.b - 45)}, ${0.35 * k})`;
                ctx.lineWidth = Math.max(0.6, fw * 0.025); ctx.lineCap = 'round';
                for (const side of [-1, 1]) {
                    const ex = cx + side * fw * 0.44, ey = cy - fh * 0.15;
                    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(ex + side * fw * 0.2, ey + i * fh * 0.04); ctx.lineTo(ex + side * fw * 0.3, ey + i * fh * 0.07); ctx.stroke(); }   // crow's feet
                    ctx.beginPath(); ctx.moveTo(ex - side * fw * 0.08, ey + fh * 0.09); ctx.quadraticCurveTo(ex, ey + fh * 0.14, ex + side * fw * 0.12, ey + fh * 0.08); ctx.stroke();   // under the eye
                    ctx.beginPath(); ctx.moveTo(cx + side * fw * 0.2, cy + fh * 0.12); ctx.quadraticCurveTo(cx + side * fw * 0.3, cy + fh * 0.3, cx + side * fw * 0.24, cy + fh * 0.44); ctx.stroke();   // nose to mouth
                }
                for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(cx - fw * 0.28, cy - fh * (0.46 + i * 0.07)); ctx.quadraticCurveTo(cx, cy - fh * (0.49 + i * 0.07), cx + fw * 0.28, cy - fh * (0.46 + i * 0.07)); ctx.stroke(); }   // the brow
            }

            // Androids get a plated face and visor instead of human features
            let drawBrows = null, browColor = null;
            if (A) drawAndroidPortraitFace(ctx, P, A, X, blink, talk);
            else {
            // ─── EYEBROWS ───
            browColor = hair.color || '#1a1a1a';
            const browY = cy - fh * 0.32;
            const browW = fw * 0.38;
            ctx.strokeStyle = browColor;
            ctx.lineWidth = fw * 0.1;
            ctx.lineCap = 'round';
            // Each brow: outer end → arch → inner end. Lift moves it, tilt raises (worry) or
            // drops (anger) the inner end, arch bends it, raise lifts the right brow alone.
            drawBrows = () => {
                for (const side of [-1, 1]) {
                    const up = (X.brow.lift + (side > 0 ? X.brow.raise : 0)) * fh * 0.1;
                    ctx.beginPath();
                    ctx.moveTo(cx + side * fw * 0.66, browY + fh * 0.05 - up + X.brow.tilt * fh * 0.03);
                    ctx.quadraticCurveTo(cx + side * fw * 0.44, browY - fh * 0.08 - up - X.brow.arch * fh * 0.08,
                                         cx + side * fw * 0.22, browY + fh * 0.02 - up - X.brow.tilt * fh * 0.1);
                    ctx.stroke();
                }
            };
            drawBrows();
            ctx.lineCap = 'butt';

            // ─── EYES ───
            const eyeY = cy - fh * 0.15;
            const eyeSpacing = fw * 0.44;
            const eyeW = fw * 0.235;
            const eyeH = fh * 0.118;
            const irisHex = /^#[0-9a-f]{6}$/i.test(eyeColor) ? eyeColor : '#6b4a2e';
            const lidColor = /^#[0-9a-f]{6}$/i.test(skinColor) ? darkenHex(skinColor, 22) : skinColor;   // the lid sits in the socket's shade

            for (const side of [-1, 1]) {
                const ex = cx + side * eyeSpacing;
                const eyePath = () => {
                    ctx.beginPath();
                    ctx.moveTo(ex - eyeW, eyeY);
                    ctx.quadraticCurveTo(ex, eyeY - eyeH * 1.6, ex + eyeW, eyeY);
                    ctx.quadraticCurveTo(ex, eyeY + eyeH * 1.2, ex - eyeW, eyeY);
                    ctx.closePath();
                };
                // Eye white (almond), in the lid's shadow along its top
                let g = ctx.createLinearGradient(0, eyeY - eyeH * 0.9, 0, eyeY + eyeH * 0.7);
                g.addColorStop(0, '#b8aca9'); g.addColorStop(0.45, '#e9e2dd'); g.addColorStop(1, '#f6f2ee');
                ctx.fillStyle = g; eyePath(); ctx.fill();
                ctx.save(); eyePath(); ctx.clip();

                // Iris (follows the gaze; the eye's edge keeps it inside when looking away)
                const irisR = eyeH * 0.98;
                const ix = ex + X.gaze.x * eyeW * 0.35, iy = eyeY + X.gaze.y * eyeH * 0.5;
                g = ctx.createRadialGradient(ix, iy + irisR * 0.35, irisR * 0.1, ix, iy, irisR);
                g.addColorStop(0, lightenHex(irisHex, 80)); g.addColorStop(0.5, irisHex); g.addColorStop(1, darkenHex(irisHex, 70));
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(ix, iy, irisR, 0, Math.PI * 2); ctx.fill();
                // Fibres radiating from the pupil, then the dark limbal ring
                ctx.strokeStyle = lightenHex(irisHex, 100); ctx.globalAlpha = 0.28; ctx.lineWidth = Math.max(0.5, irisR * 0.07);
                ctx.beginPath();
                for (let i = 0; i < 14; i++) { const a = i * 0.449 + side; ctx.moveTo(ix + Math.cos(a) * irisR * 0.5, iy + Math.sin(a) * irisR * 0.5); ctx.lineTo(ix + Math.cos(a) * irisR * 0.85, iy + Math.sin(a) * irisR * 0.85); }
                ctx.stroke();
                ctx.globalAlpha = 0.6; ctx.strokeStyle = '#0c060a'; ctx.lineWidth = irisR * 0.14;
                ctx.beginPath(); ctx.arc(ix, iy, irisR * 0.93, 0, Math.PI * 2); ctx.stroke();
                ctx.globalAlpha = 1.0;

                // Pupil
                ctx.fillStyle = '#070407';
                ctx.beginPath(); ctx.arc(ix, iy, irisR * 0.42, 0, Math.PI * 2); ctx.fill();
                // The upper lid's shadow across the top of the eye
                g = ctx.createLinearGradient(0, eyeY - eyeH * 1.3, 0, eyeY - eyeH * 0.05);
                g.addColorStop(0, 'rgba(20, 8, 16, 0.55)'); g.addColorStop(1, 'rgba(20, 8, 16, 0)');
                ctx.fillStyle = g; ctx.fillRect(ex - eyeW, eyeY - eyeH * 1.6, eyeW * 2, eyeH * 1.6);

                // Catchlights: the key light, a soft bounce, and the room's colour on the rim side
                ctx.fillStyle = '#fff';
                ctx.globalAlpha = 0.92;
                ctx.beginPath(); ctx.arc(ix + irisR * 0.32, iy - irisR * 0.34, irisR * 0.24, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 0.45;
                ctx.beginPath(); ctx.arc(ix - irisR * 0.3, iy + irisR * 0.38, irisR * 0.1, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = `rgba(${rim}, 0.8)`; ctx.globalAlpha = 1;
                ctx.beginPath(); ctx.arc(ix - irisR * 0.58, iy - irisR * 0.12, irisR * 0.12, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // Lids: the top lid comes down (half-lidded, blinking, closed); the lower
                // lid rises for smiles. Drawn in skin over the eye.
                const lidTop = Math.min(1, Math.max(X.lids.top, blink));
                const lidY = eyeY - eyeH * 1.6 + (eyeH * 2.8) * lidTop;      // control point of the lid's edge
                if (lidTop > 0) {
                    ctx.fillStyle = lidColor;
                    ctx.beginPath();
                    ctx.moveTo(ex - eyeW - 0.5, eyeY);
                    ctx.quadraticCurveTo(ex, eyeY - eyeH * 1.75, ex + eyeW + 0.5, eyeY);
                    ctx.quadraticCurveTo(ex, lidY, ex - eyeW - 0.5, eyeY);
                    ctx.fill();
                }
                if (X.lids.bottom > 0) {
                    ctx.fillStyle = lidColor;
                    ctx.beginPath();
                    ctx.moveTo(ex - eyeW - 0.5, eyeY);
                    ctx.quadraticCurveTo(ex, eyeY + eyeH * 1.35, ex + eyeW + 0.5, eyeY);
                    ctx.quadraticCurveTo(ex, eyeY + eyeH * 1.2 - X.lids.bottom * eyeH * 1.6, ex - eyeW - 0.5, eyeY);
                    ctx.fill();
                }

                // The lid's crease above
                ctx.strokeStyle = shadowColor; ctx.lineCap = 'round';
                ctx.globalAlpha = 0.6; ctx.lineWidth = Math.max(0.7, fw * 0.028);
                ctx.beginPath();
                ctx.moveTo(ex - eyeW * 0.85, eyeY - eyeH * 0.75);
                ctx.quadraticCurveTo(ex + eyeW * 0.1, eyeY - eyeH * 2.3 + lidTop * eyeH * 0.6, ex + eyeW * 1.02, eyeY - eyeH * 0.55);
                ctx.stroke();
                ctx.globalAlpha = 1.0;
                // Eyeliner — top lid line, thickening to a small flick at the outer corner
                // (Men: a plain lash line, no flick, short sparse lashes)
                const masc = gender === 'male';
                ctx.strokeStyle = '#140a12';
                ctx.lineWidth = fw * (masc ? 0.03 : 0.045) * (1 + lidTop * 0.6);
                ctx.beginPath();
                ctx.moveTo(ex - eyeW, eyeY);
                ctx.quadraticCurveTo(ex, lidY, ex + eyeW, eyeY);
                ctx.stroke();
                if (!masc) {
                    ctx.lineWidth = fw * 0.035;
                    ctx.beginPath(); ctx.moveTo(ex + side * eyeW * 0.92, eyeY - eyeH * 0.06); ctx.lineTo(ex + side * eyeW * 1.18, eyeY - eyeH * 0.42); ctx.stroke();
                }
                // Lashes along the top lid, longest toward the outer corner (down along a closed lid)
                ctx.lineWidth = Math.max(0.6, fw * 0.022);
                if (masc) { ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(0.5, fw * 0.015); }
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const t = side > 0 ? 0.5 + i * 0.09 : 0.5 - i * 0.09, u = 1 - t;
                    const lx = u * u * (ex - eyeW) + 2 * u * t * ex + t * t * (ex + eyeW), ly = u * u * eyeY + 2 * u * t * lidY + t * t * eyeY;
                    const len = eyeH * (0.45 + i * 0.12) * (masc ? 0.5 : 1), down = lidTop > 0.7;
                    ctx.moveTo(lx, ly);
                    ctx.quadraticCurveTo(lx + side * len * 0.2, ly + (down ? len * 0.5 : -len * 0.6), lx + side * len * (0.35 + i * 0.1), ly + (down ? len * 0.7 : -len * (0.85 - i * 0.06)));
                }
                ctx.stroke();
                ctx.globalAlpha = 1; ctx.lineCap = 'butt';
                // Lower lash line (subtle)
                ctx.globalAlpha = 0.3;
                ctx.beginPath();
                ctx.moveTo(ex - eyeW * 0.7, eyeY + eyeH * 0.3);
                ctx.quadraticCurveTo(ex, eyeY + eyeH * 1.0, ex + eyeW * 0.7, eyeY + eyeH * 0.3);
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }

            // ─── NOSE ─── shaded, not outlined: a shadow down the far side, the wings, the nostrils and the shade beneath
            const noseY = cy + fh * 0.15;
            ctx.strokeStyle = shadowColor; ctx.lineCap = 'round';
            ctx.globalAlpha = 0.4; ctx.lineWidth = fw * 0.055;
            ctx.beginPath(); ctx.moveTo(cx - fw * 0.1, cy - fh * 0.1); ctx.quadraticCurveTo(cx - fw * 0.11, noseY - fh * 0.06, cx - fw * 0.15, noseY + fh * 0.01); ctx.stroke();
            ctx.globalAlpha = 0.6; ctx.lineWidth = fw * 0.035;
            for (const side of [-1, 1]) {
                ctx.beginPath(); ctx.moveTo(cx + side * fw * 0.07, noseY + fh * 0.1);
                ctx.quadraticCurveTo(cx + side * fw * 0.2, noseY + fh * 0.1, cx + side * fw * 0.15, noseY - fh * 0.005); ctx.stroke();
            }
            ctx.fillStyle = lipDark; ctx.globalAlpha = 0.65;
            for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + side * fw * 0.08, noseY + fh * 0.085, fw * 0.045, fh * 0.018, side * 0.35, 0, Math.PI * 2); ctx.fill(); }
            ctx.fillStyle = shadowColor; ctx.globalAlpha = 0.3;
            ctx.beginPath(); ctx.ellipse(cx - fw * 0.02, noseY + fh * 0.155, fw * 0.15, fh * 0.03, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.24;
            ctx.beginPath(); ctx.ellipse(cx + fw * 0.035, noseY + fh * 0.02, fw * 0.05, fh * 0.03, 0, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1.0; ctx.lineCap = 'butt';

            // ─── LIPS ───
            const mouthY = cy + fh * 0.48;
            const mouthW = fw * 0.35 * (1 + X.mouth.width);
            // Corners: curve lifts both (smile) or drops them (frown); smirk lifts one
            const lcY = mouthY - X.mouth.curve * fh * 0.1 + X.mouth.smirk * fh * 0.02;
            const rcY = mouthY - X.mouth.curve * fh * 0.1 - X.mouth.smirk * fh * 0.08;
            const open = Math.min(1, X.mouth.open + talk) * fh * 0.14;     // how far the lower lip drops
            if (open > 0) {
                // Inside of the mouth, then a hint of teeth under the upper lip
                ctx.fillStyle = '#2a0f16';
                ctx.beginPath();
                ctx.moveTo(cx - mouthW, lcY);
                ctx.quadraticCurveTo(cx, mouthY + fh * 0.02, cx + mouthW, rcY);
                ctx.quadraticCurveTo(cx, mouthY + fh * 0.06 + open * 2, cx - mouthW, lcY);
                ctx.fill();
                if (open > fh * 0.035) {
                    ctx.fillStyle = '#f1ebe4';
                    ctx.beginPath();
                    ctx.moveTo(cx - mouthW * 0.8, lcY + fh * 0.01);
                    ctx.quadraticCurveTo(cx, mouthY + fh * 0.02, cx + mouthW * 0.8, rcY + fh * 0.01);
                    ctx.quadraticCurveTo(cx, mouthY + fh * 0.02 + open * 0.7, cx - mouthW * 0.8, lcY + fh * 0.01);
                    ctx.fill();
                }
            }
            // Upper lip (darker)
            ctx.fillStyle = lipDark;
            ctx.beginPath();
            ctx.moveTo(cx - mouthW, lcY);
            ctx.quadraticCurveTo(cx - mouthW * 0.4, mouthY - fh * 0.09, cx, mouthY - fh * 0.05);
            ctx.quadraticCurveTo(cx + mouthW * 0.4, mouthY - fh * 0.09, cx + mouthW, rcY);
            ctx.quadraticCurveTo(cx, mouthY + fh * 0.02, cx - mouthW, lcY);
            ctx.closePath();
            ctx.fill();
            // Lower lip (fuller, lighter)
            ctx.fillStyle = lipColor;
            ctx.beginPath();
            ctx.moveTo(cx - mouthW, lcY);
            ctx.quadraticCurveTo(cx, mouthY + fh * 0.16 + open, cx + mouthW, rcY);
            ctx.quadraticCurveTo(cx, mouthY + fh * 0.06 + open * 2, cx - mouthW, lcY);
            ctx.closePath();
            ctx.fill();
            // The parting line, the shade under the lower lip, and the lips' shine
            if (open <= 0) {
                ctx.strokeStyle = 'rgba(40, 10, 20, 0.6)'; ctx.lineWidth = Math.max(0.7, fw * 0.028); ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(cx - mouthW, lcY); ctx.quadraticCurveTo(cx, mouthY + fh * 0.02, cx + mouthW, rcY); ctx.stroke();
                ctx.lineCap = 'butt';
            }
            ctx.fillStyle = shadowColor; ctx.globalAlpha = 0.3;
            ctx.beginPath(); ctx.ellipse(cx, mouthY + fh * 0.22 + open, mouthW * 0.55, fh * 0.035, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.globalAlpha = 0.32;
            ctx.beginPath();
            ctx.ellipse(cx + mouthW * 0.18, mouthY + fh * 0.09 + open, mouthW * 0.22, fh * 0.022, -0.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.16;
            ctx.beginPath(); ctx.ellipse(cx + mouthW * 0.3, mouthY - fh * 0.045, mouthW * 0.14, fh * 0.012, 0.2, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1.0;
            }

            // A mask goes on over the face, under the fringe
            for (const j of jewelry) if (WD.jewelry[j.type].at === 'face') WD.jewelry[j.type].portrait(ctx, P, j);

            // ─── HAIR (FRONT LAYER — on top of face) ───
            // The fringe stops at the brow: the front layer is clipped out of a window over the
            // eyes and lower face (even-odd), so every style frames the face and never covers the eyes.
            if (hair) {
                const renderer = PORTRAIT_HAIR_RENDERERS[hair.type];
                if (renderer) {
                    ctx.save();
                    ctx.beginPath(); ctx.rect(-w, -h, w * 3, h * 3);
                    ctx.ellipse(cx, cy + fh * 0.2, fw * 0.95, fh * 0.6, 0, 0, Math.PI * 2);
                    ctx.clip('evenodd');
                    _portraitHair(ctx, hair.type, hair, cx, cy, fw, fh, w, h, rim, 3, { front: true });
                    ctx.restore();
                }
            }

            // ─── JEWELRY AND HAT ───
            for (const j of jewelry) if (WD.jewelry[j.type].at === 'head' && !WD.jewelry[j.type].underHair) WD.jewelry[j.type].portrait(ctx, P, j);
            for (const j of jewelry) if (WD.jewelry[j.type].portraitOver) WD.jewelry[j.type].portraitOver(ctx, P, j);   // a mask's eyes, through the fringe
            const hatPiece = WD && config.hat ? WD.hats[config.hat.type] : null;
            if (hatPiece) hatPiece.portrait(ctx, P, config.hat);
        }

        /** Renders "long" hair behind head, then head+face, then other hair on top. */
        const HAIR_SPILLS_FROM_HOOD = ['long', 'braids', 'dreadlocks', 'ponytail', 'demon_dancer'];
        function drawHeadAndHair(ctx, headX, skinColor, faceDark, faceLight, hair, dyn, hat, jewelry) {
            dyn = dyn || {};
            const hatPiece = hat && typeof WARDROBE !== 'undefined' ? WARDROBE.hats[hat.type] : null;
            if (hatPiece && hatPiece.back) hatPiece.back(ctx, headX, hat, dyn);   // e.g. the back of a raised hood
            // Eyes — they blink now and then, each character on their own rhythm
            const owner = dyn.owner;
            if (owner && owner._blinkSeed === undefined) owner._blinkSeed = Math.floor(Math.random() * 997);
            const blinkNow = owner ? blinkAmount(_gameTimeSec, owner._blinkSeed) : 0;
            // Earrings hang beneath the head and hair, the head hiding where they meet the ear; other
            // head jewelry keeps its layer above the hair.
            if (jewelry && typeof WARDROBE !== 'undefined') {
                for (const j of jewelry) { const piece = WARDROBE.jewelry[j.type]; if (piece && piece.underHair) piece.draw(ctx, { headX }, j); }
            }
            if (dyn.android) {
                drawAndroidHead(ctx, headX, dyn.android, blinkNow);        // plated dome and visor (ui/bodies.js)
            } else {
                const H = bodyHeadPaths();                                    // an egg from above, the ears just showing (ui/bodies.js)
                ctx.beginPath(); ctx.translate(headX, 0);
                ctx.fillStyle = darkenHex(skinColor, 26); ctx.fill(H.ears);
                ctx.fillStyle = skinColor; ctx.fill(H.head);
                ctx.translate(-headX, 0);
                if (blinkNow < 0.5) {
                    ctx.fillStyle = faceDark; ctx.fillRect(headX + 4, -2, 2, 1);
                    ctx.fillStyle = faceLight; ctx.fillRect(headX + 5, 2, 2, 1);
                }
            }
            // Hair (all styles render on top of head) — strand physics via hairGeometry().
            // A raised hood hides short styles; long ones still spill out from under it.
            if (hair && !(hatPiece && hatPiece.hides === 'most' && !HAIR_SPILLS_FROM_HOOD.includes(hair.type))) {
                const renderer = HAIR_RENDERERS[hair.type];
                if (renderer) {
                    const geo = hairGeometry(ctx, headX, hair, dyn);
                    renderer(ctx, hair.color, headX, dyn, geo);
                    if (!geo.lod && !_crowdLite) _hairFinish(ctx, hair, headX, geo);
                }
            }
            // Other head jewelry keeps its existing layer above hair.
            if (jewelry && typeof WARDROBE !== 'undefined') {
                for (const j of jewelry) { const piece = WARDROBE.jewelry[j.type]; if (piece && !piece.underHair && (piece.at === 'head' || piece.at === 'face')) piece.draw(ctx, { headX }, j); }
            }
            // Hat (renders on top of everything)
            if (hatPiece) hatPiece.draw(ctx, headX, hat, dyn);
        }

        /* ── Shading ── Matte: no highlights at all. Seen from above, limbs are cylinders and the head a
           dome, so each gets a smooth, wide shade on the side away from the sun (a soft sprite, no hard
           edge). Hair gradients within its own colour: dark hair lifts a little toward the light, light
           hair deepens a little away from it. Only glossy fabric (finish: 'gloss', e.g. leggings) keeps
           a crisp sheen; jewelry shines on its own. humanShade() works out the light once per body
           (null = flat); the passes read it. */
        /** A soft light or shade (a radial sprite stretched to w×h, centred at x, y) at alpha a. */
        function _softSpot(ctx, x, y, w, h, rgb, a) {
            if (a <= 0.004) return;
            const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * a;
            ctx.drawImage(glowSprite(rgb, 0), x - w / 2, y - h / 2, w, h);
            ctx.globalAlpha = a0;
        }
        /** Hair's own gradient tone: dark hair → a slightly lighter shade of itself (toward the light),
         *  light hair → a slightly darker one (away from it). { rgb, up } (up: toward the light). */
        const _hairTones = new Map();
        function _hairTone(hex) {
            let t = _hairTones.get(hex);
            if (t) return t;
            const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
            if (!m) return null;
            const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, luma = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
            const up = luma < 0.45, k = up ? 38 + 30 * (0.45 - luma) : -48;
            const c = v => Math.max(0, Math.min(255, Math.round(v + k)));
            t = { rgb: `${c(r)}, ${c(g)}, ${c(b)}`, up };
            _hairTones.set(hex, t);
            return t;
        }
        /** Is this piece of clothing glossy? The item's own finish wins, else the wardrobe piece's. */
        function _glossy(piece, item) { return !!item && (item.finish ? item.finish === 'gloss' : !!(piece && piece.finish === 'gloss')); }
        let _shadeFrame = -1, _shadeRims = 0, _lampGrid = null, _shadeCols = null, _bodyRot = 0;
        const _SHADOW_RGB = '12, 6, 28';

        /** A new map: drop the old map's lamp buckets (map-loading.js) */
        function humanShadeReset() { _lampGrid = null; }

        /** Street lamps bucketed in 200px cells, rebuilt when the map's lamp list changes. */
        function _lampCells() {
            const L = typeof game !== 'undefined' ? game.lamps : null;
            if (!L || !L.length) return null;
            if (!_lampGrid || _lampGrid.src !== L || _lampGrid.n !== L.length) {
                const cells = new Map();
                for (const l of L) { if (l.candle) continue; const k = Math.floor(l.x / 200) + ',' + Math.floor(l.y / 200); (cells.get(k) || cells.set(k, []).get(k)).push(l); }
                _lampGrid = { src: L, n: L.length, cells };
            }
            return _lampGrid.cells;
        }
        function _lampNear(x, y, R) {
            const cells = _lampCells();
            if (!cells) return null;
            const cx = Math.floor(x / 200), cy = Math.floor(y / 200);
            let best = null, bd = R;
            for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
                const c = cells.get((cx + i) + ',' + (cy + j));
                if (c) for (const l of c) { const d = Math.hypot(l.x - x, l.y - y); if (d < bd) { bd = d; best = l; } }
            }
            return best ? { l: best, d: bd } : null;
        }
        /** The (up to) two nearest street lamps within R of x, y, nearest first: [{ l, d }] (reused array). */
        const _lampPair = [{ l: null, d: 0 }, { l: null, d: 0 }];
        let _lampPairN = 0;
        function _lampsNear2(x, y, R) {
            _lampPairN = 0;
            const cells = _lampCells();
            if (!cells) return 0;
            const cx = Math.floor(x / 200), cy = Math.floor(y / 200), A = _lampPair[0], B = _lampPair[1];
            for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
                const c = cells.get((cx + i) + ',' + (cy + j));
                if (c) for (const l of c) {
                    const d = Math.hypot(l.x - x, l.y - y);
                    if (d >= R) continue;
                    if (!_lampPairN || d < A.d) { B.l = A.l; B.d = A.d; A.l = l; A.d = d; _lampPairN = Math.min(2, _lampPairN + 1); }
                    else if (_lampPairN < 2 || d < B.d) { B.l = l; B.d = d; _lampPairN = 2; }
                }
            }
            return _lampPairN;
        }

        /**
         * The light on this body right now, in its own frame: level (0 flat · 1 limbs only · 2 all),
         * lx/ly (unit-ish toward the light, 0 when it's overhead), hl/sh (shine and shade fills),
         * body (knuckles and torso too: named characters, not the crowd), rim (a lamp's colour,
         * its direction and strength) or null.
         */
        function humanShade(ctx, entity, config) {
            const lod = typeof _zoomLOD !== 'undefined' ? _zoomLOD : 0;
            const ped = typeof Pedestrian !== 'undefined' && entity instanceof Pedestrian;
            const level = lod === 0 ? 2 : (lod === 1 && !ped ? 1 : 0);
            if (!level || _crowdLite || typeof sunNow !== 'function') return null;    // (Crowd Quality medium/low: flat)
            if (_shadeFrame !== _frameTime) { _shadeFrame = _frameTime; _shadeRims = 0; _shadeCols = null; }
            const C = CONFIG.HUMAN_SHADE, sun = sunNow();
            const rot = _bodyRot, c = Math.cos(rot), s = Math.sin(rot);
            const d = sun.day > 0.05 ? Math.min(1, sun.day * 1.4) : 0;
            const W = Math.round((config._wet || 0) * 4) / 4;
            const lx = (c * sun.dx + s * sun.dy) * d, ly = (-s * sun.dx + c * sun.dy) * d;
            // The fills are the same for everyone this frame (per wetness step): built once
            if (!_shadeCols) _shadeCols = new Map();
            let K = _shadeCols.get(W);
            if (!K) {
                const a = (d > 0 ? C.HL_DAY * (0.5 + 0.5 * d) : C.HL_NIGHT) + W * C.HL_RAIN, rgb = d > 0 ? sun.rgb : '214, 204, 255';
                const shA = C.SHADE * (0.4 + 0.6 * d);
                K = { a, rgb, shA, hl: `rgba(${rgb}, ${a.toFixed(3)})`, hl2: `rgba(${rgb}, ${(a * 1.25).toFixed(3)})`,
                      sh: `rgba(${_SHADOW_RGB}, ${shA.toFixed(3)})` };
                _shadeCols.set(W, K);
            }
            const S = { level, body: level > 1 && !ped, lx, ly, a: K.a, m: Math.min(1, K.a * 1.7), shA: K.shA, rgb: K.rgb, hl: K.hl, hl2: K.hl2, sh: K.sh, rim: null };
            // Night: the nearest burning street lamp rims them in its colour (the block's lamp colour)
            if (level === 2 && sun.night > 0.3 && entity.x !== undefined && (!ped || _shadeRims < C.RIM_PEDS)) {
                const n = _lampNear(entity.x, entity.y, C.RIM_R);
                if (n) {
                    const on = lampWake(n.l) * lampFlicker(n.l) * (n.l.intensity ?? 1);
                    const indoor = game.activeMap && game.activeMap.type !== 'outdoor';    // a room's lamps burn all night and day
                    const k = on * (1 - n.d / C.RIM_R) * (indoor ? C.RIM_INDOOR : Math.min(1, (sun.night - 0.3) / 0.4)) * C.RIM_A;
                    if (k > 0.03) {
                        if (ped && !entity._reflectionProxy) _shadeRims++;
                        const wx = n.l.x - entity.x, wy = n.l.y - entity.y, m = Math.hypot(wx, wy) || 1;
                        const col = /^#[0-9a-f]{6}$/i.test(n.l.color || '') ? hexToRgb(n.l.color) : '255, 238, 187';
                        S.rim = { ang: Math.atan2(-s * wx / m + c * wy / m, c * wx / m + s * wy / m), style: `rgba(${col}, ${k.toFixed(3)})`,
                                  soft: `rgba(${col}, ${(k * 0.35).toFixed(3)})`, rgb: col, k };
                    }
                }
            }
            return S;
        }

        /** Centred ground contact at every facing, plus a sun-directed cast by day.
         * Lamp casts are noted here and painted on their separate ground/light layers. */
        let _contactShadowX, _contactShadowY, _contactShadowAngle = 0;
        function _contactShadowDirection(x, y) {
            if (!Object.is(x, _contactShadowX) || !Object.is(y, _contactShadowY)) {
                _contactShadowX = x; _contactShadowY = y; _contactShadowAngle = Math.atan2(y, x);
            }
            return _contactShadowAngle;
        }
        let _humanContactSprite = null;
        function drawHumanContactShadow(ctx, entity) {
            if (typeof _zoomLOD !== 'undefined' && _zoomLOD >= 2) return;
            const C = CONFIG.HUMAN_SHADE, a0 = ctx.globalAlpha;
            if (!_humanContactSprite) {
                const cv = _humanContactSprite = document.createElement('canvas');
                cv.width = cv.height = 96;
                const c = cv.getContext('2d'), g = c.createRadialGradient(48, 48, 0, 48, 48, 48);
                g.addColorStop(0, 'rgba(0,0,0,.58)');
                g.addColorStop(.55, 'rgba(0,0,0,.40)');
                g.addColorStop(.8, 'rgba(0,0,0,.18)');
                g.addColorStop(1, 'rgba(0,0,0,0)');
                c.fillStyle = g; c.fillRect(0, 0, 96, 96);
            }
            // Lamp shadows from dusk, while the sun's cast fades.
            if (entity && entity.x !== undefined && _lampShadowLevel() && sunNow().night > 0.3) _noteLampShadowBody(entity, C);
            ctx.save();
            // Undo the body facing once: neither the contact ellipse nor the sun's
            // anchor should acquire a rotating local offset. Keep parent scale/alpha.
            ctx.rotate(-_bodyRot);
            if (typeof _sunShadow !== 'undefined' && _sunShadow.on) {
                const L = Math.min(1.6, _sunShadow.len) * _sunShadow.k;
                ctx.save();
                ctx.rotate(_contactShadowDirection(_sunShadow.dx, _sunShadow.dy));
                ctx.translate(2 + 5 * L, 0); ctx.scale((11 + 9 * L) / 32, 9 / 32);
                ctx.globalAlpha = a0 * (C.SHADOW_NIGHT + (C.SHADOW_DAY - C.SHADOW_NIGHT) * _sunShadow.k);
                ctx.drawImage(glowSprite(_SHADOW_RGB, 0.45), -32, -32);
                ctx.restore();
            }
            ctx.drawImage(_humanContactSprite, -C.CONTACT_RX, -C.CONTACT_RY, C.CONTACT_RX * 2, C.CONTACT_RY * 2);
            ctx.restore();
        }
        /** Lamp shadows (Settings → Graphics → Lamp Shadows): cast away from the nearest burning lamps at night.
         *   low   — a soft shade stretched away from each of the two nearest lamps, longer the farther off a
         *           person stands (a lamp is only a few heads taller than a person), fading with the lamp's
         *           falloff; the light layer takes the lamp's light back past the feet (cheap: a few sprites)
         *   high  — the shade is the body's own silhouette, stretched away from the lamp: the body is drawn
         *           into SilhouetteFX's capture and stamped back (nothing ticks twice), and the capture kept
         *           small for the next frame's shadow (costs a capture and a copy per lit body)
         *   ultra — and every lit lamp near a person is blocked by them, like a wall: a wedge of the dark
         *           from the body out to the lamp's reach in the light layer (bodies × lamps, every frame)
         *   off   — none
         *  They lie on their own layer under everyone: a body's draw only notes that it was drawn
         *  (_noteLampShadowBody), and draw.js paints the shadows of the bodies noted last frame, at where they
         *  stand now, before the people pass (drawLampShadowsUnder). The light layer's half is
         *  drawLampShadowsInto (lighting.js). */
        const LampShadows = { frame: -1, n: 0, list: [], noted: [], drawn: [], noteFrame: -1, peds: 0, tint: null, sprite: null, ground: null,
                              seq: 0, captures: 0, captureFrame: -1, keeps: new WeakMap(), bodies: [] };
        const LAMP_KEEP = 40;                                                    // kept silhouette, px a side
        /** 0 off · 1 low · 2 high · 3 ultra */
        function _lampShadowLevel() {
            const v = typeof GameSettings !== 'undefined' ? GameSettings.lampShadows : 'low';
            return v === 'ultra' ? 3 : v === 'high' ? 2 : v === 'off' ? 0 : 1;
        }
        /** A firmer blob than the contact shadow's: a person's length of shade with a soft rim, so it reads as a shape. */
        function _lampShadowSprite(rgb, cv) {
            cv = cv || document.createElement('canvas'); cv.width = cv.height = 64;
            const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
            g.addColorStop(0, `rgba(${rgb}, 1)`); g.addColorStop(0.55, `rgba(${rgb}, 0.85)`); g.addColorStop(1, `rgba(${rgb}, 0)`);
            c.fillStyle = g; c.fillRect(0, 0, 64, 64);
            return cv;
        }
        function _noteLampShadowBody(entity, C) {
            const S = LampShadows;
            if (S.noteFrame !== _frameTime) { S.noteFrame = _frameTime; S.peds = 0; }
            if (entity._lampShadowFrame === _frameTime) return;               // once a frame, however many times it's drawn
            const ped = typeof Pedestrian !== 'undefined' && entity instanceof Pedestrian;
            if ((ped && S.peds >= C.LAMP_SHADOW_PEDS) || S.noted.length >= 128) return;   // (a view that never paints them can't pile up)
            if (ped) S.peds++;
            entity._lampShadowFrame = _frameTime;
            S.noted.push(entity);
        }
        /** High and up: should this body be drawn through the capture, so its silhouette can cast the shadow? */
        function _lampShadowWants(entity, config) {
            if (_lampShadowLevel() < 2 || config._crowdBake || config.isDriving || config.noShadow || entity._reflectionProxy) return false;
            if (entity.x === undefined || (typeof _zoomLOD !== 'undefined' && _zoomLOD >= 2) || typeof sunNow !== 'function' || sunNow().night <= 0.3) return false;
            const S = LampShadows;
            if (S.captureFrame !== _frameTime) { S.captureFrame = _frameTime; S.captures = 0; }
            if (S.captures >= CONFIG.HUMAN_SHADE.LAMP_SHADOW_HIGH_MAX) return false;
            if (!_lampsNear2(entity.x, entity.y, CONFIG.HUMAN_SHADE.LAMP_SHADOW_R)) return false;
            S.captures++;
            return true;
        }
        /** SilhouetteFX.end hands over a finished capture (before any tint): kept small, in the shadow's colour,
         *  with where its pixels sit in the world, for the next frame's shadow. */
        function keepLampSilhouette(entity, cv, ox, oy, side) {
            const W = typeof _worldMatrix !== 'undefined' ? _worldMatrix : null;
            if (!W || !side || typeof DOMMatrix === 'undefined') return;
            const S = LampShadows;
            let k = S.keeps.get(entity);
            if (!k) {
                const kc = document.createElement('canvas'); kc.width = kc.height = LAMP_KEEP;
                k = { cv: kc, m: null, x: 0, y: 0, seq: -1 };
                S.keeps.set(entity, k);
            }
            const g = k.cv.getContext('2d');
            if (!g) return;
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.globalCompositeOperation = 'copy';
            // Only the middle LAMP_SHADOW_CAP_R round the body (her glow's capture reaches farther)
            const half = side / 2, cut = Math.min(half, CONFIG.HUMAN_SHADE.LAMP_SHADOW_CAP_R * Math.hypot(W.a, W.b)), o = half - cut;
            g.drawImage(cv, o, o, cut * 2, cut * 2, 0, 0, LAMP_KEEP, LAMP_KEEP);
            g.globalCompositeOperation = 'source-in';
            g.fillStyle = `rgb(${_SHADOW_RGB})`; g.fillRect(0, 0, LAMP_KEEP, LAMP_KEEP);
            g.globalCompositeOperation = 'source-over';
            // kept px → capture px → screen → world
            const sc = cut * 2 / LAMP_KEEP;
            k.m = new DOMMatrix([W.a, W.b, W.c, W.d, W.e, W.f]).inverse().multiply(new DOMMatrix([sc, 0, 0, sc, ox + o, oy + o]));
            k.x = entity.x; k.y = entity.y; k.seq = S.seq;
        }
        /** The ground layer (draw.js, before the people pass, world transform): last frame's bodies, where they stand now. */
        function drawLampShadowsUnder(ctx) {
            const S = LampShadows, C = CONFIG.HUMAN_SHADE, bodies = S.noted, level = _lampShadowLevel();
            S.noted = S.drawn; S.noted.length = 0; S.drawn = bodies;            // swap: this frame's draws note into the other list
            S.frame = _frameTime; S.n = 0; S.bodies.length = 0; S.seq++;
            if (!bodies.length || !level || (typeof _zoomLOD !== 'undefined' && _zoomLOD >= 2)) return;
            const sun = sunNow();
            if (sun.night <= 0.3) return;
            const dusk = Math.min(1, (sun.night - 0.3) / 0.4), sp = S.ground || (S.ground = _lampShadowSprite(_SHADOW_RGB));
            const a0 = ctx.globalAlpha, D = C.LAMP_SHADOW_DEPTH;
            for (const e of bodies) {
                if (e.visible === false || e.dead || e.inCar) continue;
                const n = _lampsNear2(e.x, e.y, C.LAMP_SHADOW_R);
                if (!n) continue;
                S.bodies.push(e);
                const keep = level >= 2 ? S.keeps.get(e) : null, sil = keep && keep.m && S.seq - keep.seq <= 2 ? keep : null;
                for (let i = 0; i < n; i++) {
                    const { l, d } = _lampPair[i];
                    const k = lampWake(l) * lampFlicker(l) * (l.intensity ?? 1) * (1 - d / C.LAMP_SHADOW_R) * dusk;
                    if (k < 0.03) continue;
                    const len = Math.min(C.LAMP_SHADOW_MAX, d * C.LAMP_SHADOW_K), ang = Math.atan2(e.y - l.y, e.x - l.x);
                    const a = Math.min(1, k * 1.6);
                    ctx.save();
                    ctx.translate(e.x, e.y); ctx.rotate(ang);
                    if (sil) {
                        // The body's silhouette, stretched away from the lamp from its near edge
                        ctx.translate(-D / 2, 0); ctx.scale((D + len) / D, 1); ctx.translate(D / 2, 0);
                        ctx.rotate(-ang); ctx.translate(-sil.x, -sil.y);
                        const m = sil.m; ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
                        ctx.globalAlpha = a0 * C.LAMP_SHADOW_A * C.LAMP_SHADOW_SIL * a;
                        ctx.drawImage(sil.cv, 0, 0);
                    } else {
                        ctx.translate(len / 2 - 2, 0); ctx.scale((20 + len) / 64, (9 + len * 0.06) / 32);
                        ctx.globalAlpha = a0 * C.LAMP_SHADOW_A * a;
                        ctx.drawImage(sp, -32, -32);
                    }
                    ctx.restore();
                    const rec = S.list[S.n] || (S.list[S.n] = {});
                    S.n++;
                    rec.x = e.x; rec.y = e.y; rec.ang = ang; rec.len = len; rec.a = a;
                }
            }
            ctx.globalAlpha = a0;
        }
        /** The light layer's half (lighting.js, after its colour pass): this frame's lamp shadows, in the dark's own colour.
         *  Ultra: each body blocks every lit lamp it stands in, out to the lamp's reach (lit: the lamps lit this frame). */
        function drawLampShadowsInto(lc, tintRGB, lit) {
            const S = LampShadows, C = CONFIG.HUMAN_SHADE;
            if (S.frame !== _frameTime || !S.n || !C.LAMP_SHADOW_DARK) return;
            const a0 = lc.globalAlpha;
            lc.globalCompositeOperation = 'source-over';
            if (_lampShadowLevel() >= 3 && lit && lit.length) {
                const r = C.LAMP_BLOCK_R, dusk = Math.min(1, Math.max(0, (sunNow().night - 0.3) / 0.4));
                for (const e of S.bodies) for (const l of lit) {
                    const dx = e.x - l.x, dy = e.y - l.y, d = Math.hypot(dx, dy), R = l.radius;
                    if (d <= r * 1.5 || d >= R * 0.9) continue;
                    const k = Math.min(1, l._litK || 1) * (1 - d / R) * dusk;
                    if (k < 0.03) continue;
                    const ux = dx / d, uy = dy / d, nx = -uy, ny = ux, t = r / d;   // t: the spread (tan of the half-angle, near enough)
                    const fx = l.x + ux * R, fy = l.y + uy * R, w = R * t;
                    const g = lc.createLinearGradient(e.x, e.y, fx, fy);
                    g.addColorStop(0, `rgba(${tintRGB}, ${(C.LAMP_BLOCK_A * k).toFixed(3)})`); g.addColorStop(1, `rgba(${tintRGB}, 0)`);
                    lc.fillStyle = g;
                    lc.beginPath();
                    lc.moveTo(e.x + nx * r, e.y + ny * r); lc.lineTo(fx + nx * w, fy + ny * w);
                    lc.lineTo(fx - nx * w, fy - ny * w); lc.lineTo(e.x - nx * r, e.y - ny * r);
                    lc.closePath(); lc.fill();
                }
                lc.globalAlpha = a0;
                return;
            }
            if (S.tint !== tintRGB) { S.sprite = _lampShadowSprite(tintRGB, S.sprite); S.tint = tintRGB; }    // rebuilt when the dark's colour shifts
            for (let i = 0; i < S.n; i++) {
                const r = S.list[i];
                lc.save();
                lc.translate(r.x, r.y); lc.rotate(r.ang);
                lc.translate(r.len / 2 + 9, 0); lc.scale((10 + r.len) / 64, (11 + r.len * 0.08) / 32);   // from just past the feet
                lc.globalAlpha = C.LAMP_SHADOW_DARK * r.a;
                lc.drawImage(S.sprite, -32, -32);
                lc.restore();
            }
            lc.globalAlpha = a0;
        }

        /**
         * Draw a procedural character. Builds and height (ui/bodies.js) scale the body
         * frame here; a hovering android bobs over a soft glow.
         */
        /** What the entity pass drew this frame, for the profiler (reset by draw.js; ms only while it's on, Full) */
        const RenderStats = { bodies: 0, liveBodies: 0, cachedBodies: 0, bakedBodies: 0, culled: 0, peopleMs: 0, timed: false, calls: 0, ticks: 1, bldBase: 0, bldTops: 0, peopleScope: false, peopleDepth: 0, peopleParts: Object.create(null), peoplePart: null, peoplePartT: 0, peopleOpaque: false };

        function drawProceduralHumanoid(ctx, entity, config = {}) {
            if (config._crowdBake) RenderStats.bakedBodies++;
            else { RenderStats.bodies++; RenderStats.liveBodies++; }
            // Her glow, or a hostile burning white in night vision (ui/silhouette-fx.js)
            const fx = SilhouetteFX.take(entity, config), lampSil = _lampShadowWants(entity, config);
            if (fx || lampSil) return _drawHumanoidSilhouette(ctx, entity, config, fx || 'plain', lampSil);
            if (!RenderStats.timed) return _drawProceduralHumanoid(ctx, entity, config);
            const t0 = performance.now();
            RenderStats.peopleDepth++;
            try { return _drawProceduralHumanoid(ctx, entity, config); }
            finally { RenderStats.peopleDepth--; RenderStats.peopleMs += performance.now() - t0; }
        }
        /** The body drawn into SilhouetteFX's capture (its contact shadow stays on the frame), then stamped back with its effect. */
        function _drawHumanoidSilhouette(ctx, entity, config, fx, lampSil) {
            // The body itself is drawn through the capture, so the capture must hold all of it: a lamp shadow
            // alone captures tightly (LAMP_SHADOW_CAP_R), unless a weapon in hand reaches past that (a sniper: ~65px)
            const armed = (entity.type === 'player' && entity._game && entity._game.currentWeapon) || (config.weapon && config.weapon.id);
            const g = SilhouetteFX.begin(ctx, fx === 'plain' && !armed ? CONFIG.HUMAN_SHADE.LAMP_SHADOW_CAP_R : undefined);
            if (!g) return _drawProceduralHumanoidTimed(ctx, entity, config);
            const noShadow = config.noShadow;
            try {
                if (!noShadow && _zoomLOD < 2) {
                    const t = ctx.getTransform(); _bodyRot = Math.atan2(t.b, t.a);
                    drawHumanContactShadow(ctx, entity);
                }
                config.noShadow = true;
                if (lampSil) SilhouetteFX.keepFor(entity);                       // its silhouette casts its lamp shadow (High)
                _drawProceduralHumanoidTimed(g, entity, config);
            } finally {
                config.noShadow = noShadow;
                SilhouetteFX.end(fx, SilhouetteFX.heat);
            }
        }
        function _drawProceduralHumanoidTimed(ctx, entity, config) {
            if (!RenderStats.timed) return _drawProceduralHumanoid(ctx, entity, config);
            const t0 = performance.now();
            RenderStats.peopleDepth++;
            try { return _drawProceduralHumanoid(ctx, entity, config); }
            finally { RenderStats.peopleDepth--; RenderStats.peopleMs += performance.now() - t0; }
        }

        // Retain body-drawing buffers and helpers per owner. Values are rewritten every
        // draw so outfit edits, weather and pose changes do not require invalidation.
        const _humanoidDrawBuffers = new WeakMap();
        function _humanoidDrawBuffer(entity) {
            let h = _humanoidDrawBuffers.get(entity);
            if (h) return h;
            h = { entity, clothes: {}, shadeConfig: { _wet: 0 }, scaleFrame: { x: 1, y: 1, k: 1 }, limbGeometry: { length: 0, angle: 0 },
                clothDyn: { wind: null },
                driveDyn: { owner: entity, sway: 0, drag: 0, bounce: 0, wiggle: 0, android: null },
                walkDyn: { owner: entity, sway: 0, drag: 0, bounce: 0, wiggle: 0, wind: null, android: null } };
            h.darken = (hex, frac) => hex ? darkenHex(hex, Math.floor(255 * (hex === h.skin ? frac : frac + h.wet))) : '#000';
            h.withHead = (hx, draw) => {
                const ctx = h.ctx, S = h.scale;
                if (!S) return draw(hx);
                ctx.save(); ctx.scale(S.k / S.x, S.k / S.y); draw(hx * S.x / S.k); ctx.restore();
            };
            h.pf = (key, i) => (h.pose && h.pose[key] ? h.pose[key][i] * h.poseW : 0);
            // A limb segment between two joints, tapered by T (ui/bodies.js): round at each joint so the
            // next segment carries on from the same circle. Only fillStyle changes without a shade, so
            // restore that explicitly. The path is cleared after the fill: the browser would otherwise
            // re-map it through every later transform, save and restore.
            h.drawLimb = (x1, y1, x2, y2, T, color, gloss) => {
                const ctx = h.ctx, SH = h.shade;
                if (!SH) {
                    const fill = ctx.fillStyle;
                    ctx.fillStyle = color; bodyLimbPath(ctx, x1, y1, x2, y2, T); ctx.fill(); ctx.beginPath();
                    ctx.fillStyle = fill;
                    return;
                }
                const shaded = gloss || SH.lx || SH.ly, geometry = shaded ? h.limbGeometry : null;
                ctx.fillStyle = color; bodyLimbPath(ctx, x1, y1, x2, y2, T, geometry); ctx.fill(); ctx.beginPath();
                if (!shaded) return;
                const len = geometry.length/2 + 2, ang = geometry.angle, width = Math.max(T[0], T[1]);
                const c = Math.cos(ang), s = Math.sin(ang), ly = -s * SH.lx + c * SH.ly, lx = (c * SH.lx + s * SH.ly) * len * 0.1;
                ctx.save(); ctx.translate((x1+x2)/2, (y1+y2)/2); ctx.rotate(ang);
                if (gloss) {
                    ctx.fillStyle = SH.hl2;
                    ctx.beginPath(); ctx.ellipse(lx, ly * width * 0.4, len * 0.78, width * 0.32, 0, 0, Math.PI*2); ctx.fill();
                } else {
                    _softSpot(ctx, -lx, -ly * width * 0.75, len * 1.6, width * 1.3, _SHADOW_RGB, SH.shA * 1.3);
                }
                ctx.restore();
            };
            _humanoidDrawBuffers.set(entity, h);
            return h;
        }
        function _humanoidLerp(current, target, speed) { return current + (target - current) * speed; }

        function _drawProceduralHumanoid(ctx, entity, config = {}) {
            const S = bodyScale(config), A = androidLook(config.body);
            const hover = A && A.hover && !config.isDriving;
            if (!config.isDriving && _zoomLOD < 2) {
                const t = ctx.getTransform(); _bodyRot = entity._reflectionProxy ? (entity.angle || 0) : Math.atan2(t.b, t.a); // original facing for mirrored art
                if (!config.noShadow) drawHumanContactShadow(ctx, entity);
            }
            if (!S && !hover) return _drawHumanoidBody(ctx, entity, config, null, A);
            const bob = hover ? 1 + Math.sin(_gameTimeSec * 2.2 + (entity.x || 0) * 0.01) * 0.035 : 1;
            if (hover) {                                                    // light under a floating android
                const gl = ctx.createRadialGradient(-3, 0, 0, -3, 0, 15);
                gl.addColorStop(0, hexToRgba(A.glow, 0.35 * (2 - bob))); gl.addColorStop(1, hexToRgba(A.glow, 0));
                ctx.fillStyle = gl; ctx.beginPath(); ctx.ellipse(-3, 0, 15, 13, 0, 0, Math.PI * 2); ctx.fill();
            }
            const sx = (S ? S.x : 1) * bob, sy = (S ? S.y : 1) * bob;
            const muzzle = entity._muzzleLocal;
            ctx.save(); ctx.scale(sx, sy);
            const scale = _humanoidDrawBuffer(entity).scaleFrame;
            scale.x = sx; scale.y = sy; scale.k = (S ? S.k : 1) * bob;
            try { _drawHumanoidBody(ctx, entity, config, scale, A); }
            finally { ctx.restore(); }
            // Shots leave from the drawn muzzle, so carry the scale into it
            if (entity._muzzleLocal && entity._muzzleLocal !== muzzle) entity._muzzleLocal = { x: entity._muzzleLocal.x * sx, y: entity._muzzleLocal.y * sy };
        }

        function _drawHumanoidBody(ctx, entity, config, S, A) {
            // --- 1. CONFIGURATION ---
            const skinColor = A ? A.plate : (config.skinColor || '#8d5524');
            const isDriving = config.isDriving || false;
            const isShootingFromCar = config.isShootingFromCar || false;
            const carAngle = config.carAngle || 0;
            const recoil = config.recoil || 0;
            const gender = config.gender || 'androgynous';
            const bladeGame = !isDriving && entity.type === 'player' && entity._game &&
                entity._game.weaponMode === 'melee' && !entity._game.weaponHolstered ? entity._game : null;
            const bladeSwing = bladeGame && bladeGame.slashAngle ? bladeGame.slashAngle() : null;
            const bladeWide = !!(bladeGame && bladeGame.currentWeapon && weaponModel(bladeGame.currentWeapon.id).swing === 'wide');
            const stance = bladeGame ? 'knife' : (config.stance || 'idle');
            const held = config.held || null;
            // Which hand (if any) is holding a drink — it's held out and swings less
            // Weather on this character (world/weather-response.js): wind, rain, lightning; null indoors
            const W = !isDrivingCfg(config) ? weatherAt(entity) : null;
            // An umbrella opens in the rain (or when told to) and is held like a drink
            const umbrella = held && held.type === 'umbrella' && !isDrivingCfg(config) ? held : null;
            const umbrellaOpen = umbrella ? (umbrella.open !== undefined ? umbrella.open : (W && W.rain > 0.05 ? 1 : 0)) : 0;
            const glassHand = (held && !isDrivingCfg(config) && (held.type === 'glass' || held.type === 'champagne_glass' || umbrella)) ? (held.hand || 'right') : null;
            // A parcel is carried in both hands, out in front (a delivery: PARCEL_HELD)
            const parcel = !!(held && held.type === 'parcel' && !isDrivingCfg(config) && stance === 'idle');
        
            const h = _humanoidDrawBuffer(entity), clothes = h.clothes;
            h.ctx = ctx; h.scale = S; h.skin = skinColor;
            clothes.hair = config.hair || null; clothes.hat = config.hat || null;
            clothes.top = config.top || null; clothes.bottom = config.bottom || null;
            clothes.shoes = config.shoes || null; clothes.train = config.train || null;
            clothes.jewelry = config.jewelry || null;
        
            // Rain darkens clothes a touch (not skin)
            const wet = W ? W.rain * 0.08 : 0;
            h.wet = wet; h.shadeConfig._wet = W ? W.rain : 0;
            const SH = h.shade = isDriving ? null : humanShade(ctx, entity, h.shadeConfig);
            const darken = h.darken;
        
            // --- 2. PROPORTIONS ---
            // The body's shape for this gender and build (ui/bodies.js BODY_CANON)
            const BC = bodyCanon(gender, config.build);
            const shoulderSpread = BC.sh;
            // Head keeps its shape under a build's scale: draw it through this
            const withHead = h.withHead;
        
            // --- 3. GAIT (shared controller — see CONFIG.GAIT / syncHumanoidGait) ---
            const gait = syncHumanoidGait(entity);
            const gaitSpeed = isDriving ? 0 : gait.speed;
            const hovering = !!(A && A.hover);                              // floats instead of walking
            const strideLen = hovering ? 0 : humanoidStrideLength(gaitSpeed);
            const strafeLen = strideLen * CONFIG.GAIT.STRAFE_RATIO;
            const sway = Math.min(1, gaitSpeed / CONFIG.GAIT.FULL_SWAY_SPEED);
        
            // Directional orientation (travel direction relative to facing)
            let fwdAmt = 1.0, sideAmt = 0.0;
            if (gaitSpeed > 0 && entity.angle !== undefined) {
                const cos = Math.cos(-entity.angle);
                const sin = Math.sin(-entity.angle);
                fwdAmt = gait.dirX * cos - gait.dirY * sin;
                sideAmt = gait.dirX * sin + gait.dirY * cos;
            }
        
            // Walk phase blends with the body when RenderInterp has this entity mid-tick
            let walkCycle = entity.walkPhase || 0;
            if (entity._ipActive && gait.phasePrev !== undefined && Math.abs(walkCycle - gait.phasePrev) < 2) {
                walkCycle = gait.phasePrev + (walkCycle - gait.phasePrev) * RenderInterp.alpha;
            }
            // Walk oscillations. Like the arm swing, these are applied AFTER the pose
            // smoothing in step 6 — the per-render lerp there would mute and delay
            // them — so the pose targets below are built without them.
            const walkSin = Math.sin(walkCycle), walkOppSin = isDriving ? 0 : Math.sin(walkCycle + Math.PI);
            const walkBounce = (isDriving || hovering) ? 0 : Math.abs(walkSin) * (gaitSpeed * 0.2); // Bounce scales with speed
            const walkSway = walkSin * 0.3 * sway;  // sway is 0 when driving or stopped
            let bounce = 0;         // pose-target bounce; walk bounce is added after smoothing
        
            // Punch strike 0..1 (null unless the caller passes punchTicks). Applied after
            // smoothing in step 6; the body lean follows the same curve.
            const punchStrike = (stance === 'punch' && typeof config.punchTicks === 'number')
                ? humanoidPunchCurve(config.punchTicks) : null;
            let bodyRecoil = punchStrike !== null ? punchStrike * CONFIG.PUNCH.BODY_LEAN : recoil * 2;
            const driveOffset = isDriving ? 14 : 0;
            const hipAnchorX = -3 + walkBounce - bodyRecoil + driveOffset;
            const shoulderX = hipAnchorX;
            // Elbow targets use the shoulder without walk bounce (re-added after smoothing),
            // and without the punch lean (also applied after smoothing)
            const shoulderPoseX = hipAnchorX - walkBounce + (punchStrike !== null ? bodyRecoil : 0);
            let hipRotation = 0;    // pose targets; walk sway is added after smoothing
            let torsoRotation = 0;
            const armSwing = isDriving ? 0 : walkOppSin * gaitSpeed;

            // --- 3b. POSE (ui/poses.js): what the body does while standing still ---
            // Fades in after a moment standing, out the moment the character walks.
            let pose = null, poseW = 0;
            if (!isDriving && config.pose !== 'none') {
                const ps = entity._pose || (entity._pose = { still: 0, t: 0, name: null, w: 0, last: _gameTimeSec, seed: Math.random() * 97 });
                const dt = Math.max(0, Math.min(0.1, _gameTimeSec - ps.last));
                ps.last = _gameTimeSec;
                const moving = gaitSpeed > 0.15;
                ps.still = moving ? 0 : ps.still + dt;
                const name = POSES[config.pose] ? config.pose : 'idle';
                if (name !== ps.name) { ps.name = name; ps.t = 0; }
                ps.t += dt;
                const target = config.poseWhileMoving || (!moving && ps.still > 0.4) ? 1 : 0;   // (some poses hold while walking: pushing furniture)
                ps.w += (target - ps.w) * Math.min(1, dt * (target ? 3 : 10));
                if (config.poseInstant) ps.w = target;                     // a fall can't wait for the pose to fade in
                if (ps.w > 0.001) { pose = POSES[name](ps.t, { still: ps.still, seed: ps.seed, gender, beat: name === 'dance' ? mapBeatN() : null }); poseW = ps.w; }
            }
            h.pose = pose; h.poseW = poseW;
            const pf = h.pf;

            // --- 5. HAND POSITIONS ---
            let lFistX, rFistX, lFistY, rFistY;
        
            if (isDriving) {
                lFistX = 18 + driveOffset; rFistX = 18 + driveOffset;
                lFistY = -3; rFistY = 3;
            } else if (stance === 'pistol') {
                // Base pose only — the walk swing is added after smoothing (step 6)
                lFistX = -5 + bounce - bodyRecoil;
                lFistY = -11 + bounce - bodyRecoil;
                rFistX = 22 + bounce - bodyRecoil - (recoil * 6);
                rFistY = 3 + bounce - bodyRecoil;
            } else if (stance === 'rifle' || stance === 'sniper') {
                // Two-handed: stock hand at the right shoulder, support hand forward ON the
                // gun line (it used to sit ~8px inside the gun, and both hands' Y was
                // accidentally computed from the forward aim value).
                rFistX = 6 + bounce - bodyRecoil - (recoil * 6);
                rFistY = 14 - (config.scopeK || 0) * 11;                               // scoped: the gun comes up to her eye (engine/scope.js)
                const gunLineY = stance === 'sniper' ? rFistY + 0.5 : rFistY - 0.5;   // centerline of the drawn model
                lFistX = rFistX + (stance === 'sniper' ? 18 : 14) + (config.scopeK || 0) * 4;   // on the handguard / fore-end (further out, scoped)
                lFistY = gunLineY;
            } else if (stance === 'knife') {
                lFistX = 5; lFistY = -10;
                rFistX = 8; rFistY = 9;
            } else if (stance === 'punch' && punchStrike !== null) {
                // --- PUNCH: guard pose only. The strike (reach, cross, off-hand pull,
                // torso twist, lean) is shaped by CONFIG.PUNCH and added after smoothing.
                lFistX = 6;
                rFistX = 6;
                lFistY = -8;
                rFistY = 8;
            } else if (stance === 'punch') {
                // --- LEGACY PUNCH (callers that don't pass punchTicks) ---
                
                // 1. Base Guard Position
                lFistX = 6 + bounce - bodyRecoil;
                rFistX = 6 + bounce - bodyRecoil;
                lFistY = -8; 
                rFistY = 8;
                
                // 2. Check for active punch
                if (recoil > 0) {
                    const punchExt = recoil * 15;
                    // Retrieve punch side from entity, default to right
                    const punchSide = entity.punchSide || 'right';
        
                    if (punchSide === 'right') {
                        // -- RIGHT PUNCH --
                        torsoRotation += recoil * 0.5; // Twist Left
                        rFistX += punchExt;
                        rFistY -= punchExt * 0.2; // Cross inward
                        lFistX -= recoil * 3;     // Retract Left
                    } else {
                        // -- LEFT PUNCH --
                        torsoRotation -= recoil * 0.5; // Twist Right
                        lFistX += punchExt;
                        lFistY += punchExt * 0.2; // Cross inward (Positive Y moves from -8 towards 0)
                        rFistX -= recoil * 3;     // Retract Right
                    }
                } else {
                    // Idle Breathing
                    const breath = Math.sin(_frameTime / 250) * 1.5;
                    lFistX += breath;
                    rFistX += breath;
                }
            } else {
                // Idle/Walking — base pose only. The walk swing is added after the
                // smoothing below so the lerp can't soak it up.
                lFistX = -2 + bounce - bodyRecoil;
                rFistX = -2 + bounce - bodyRecoil;
                lFistY = -13;
                rFistY = 13;
                // Holding a drink: that hand is held out a little in front, elbow softly bent
                if (glassHand === 'right') { rFistX += 7; rFistY = 9; }
                else if (glassHand === 'left') { lFistX += 7; lFistY = -9; }
                // An open umbrella's handle is held up close to the chest
                if (umbrellaOpen > 0.15) { if (glassHand === 'right') { rFistX = 3 + bounce; rFistY = 5; } else { lFistX = 3 + bounce; lFistY = -5; } }
                // Carrying a parcel: both hands forward, either side of the box
                if (parcel) { lFistX = rFistX = 7.5 + bounce * 0.3; lFistY = -6.6; rFistY = 6.6; }
            }
            const walkArms = !isDriving && stance !== 'pistol' && stance !== 'rifle' && stance !== 'sniper' && stance !== 'punch' && stance !== 'knife';
            // Pose: hands (unarmed only; a hand holding a drink keeps it), twist and breathing
            if (pose) {
                if (walkArms && pose.l && glassHand !== 'left' && !parcel) { lFistX += (pose.l[0] - lFistX) * poseW; lFistY += (pose.l[1] - lFistY) * poseW; }
                if (walkArms && pose.r && glassHand !== 'right' && !parcel) { rFistX += (pose.r[0] - rFistX) * poseW; rFistY += (pose.r[1] - rFistY) * poseW; }
                torsoRotation += (pose.torso || 0) * poseW;
                hipRotation += (pose.hip || 0) * poseW;
                bounce += (pose.bounce || 0) * poseW;
            }
        
            const lShoulderY = -shoulderSpread;
            const rShoulderY = shoulderSpread;
        
            let lElbowX = (shoulderPoseX + lFistX) / 2;
            let rElbowX = (shoulderPoseX + rFistX) / 2;
            let lElbowY = (lShoulderY + lFistY) / 2;
            let rElbowY = (rShoulderY + rFistY) / 2;
            // Drink hand: elbow bent softly out to the side
            if (glassHand === 'right' && stance === 'idle') rElbowY += 3.5;
            else if (glassHand === 'left' && stance === 'idle') lElbowY -= 3.5;
            if (parcel) { lElbowY -= 3; rElbowY += 3; }                     // elbows out round the box
            if (pose && walkArms) {
                if (pose.le && glassHand !== 'left' && !parcel) { lElbowX += (pose.le[0] - lElbowX) * poseW; lElbowY += (pose.le[1] - lElbowY) * poseW; }
                if (pose.re && glassHand !== 'right' && !parcel) { rElbowX += (pose.re[0] - rElbowX) * poseW; rElbowY += (pose.re[1] - rElbowY) * poseW; }
            }
        
            if (isDriving) {
                lElbowX = 8 + driveOffset; lElbowY = -shoulderSpread - 5;
                rElbowX = 8 + driveOffset; rElbowY = shoulderSpread + 5;
            }
            
            if (stance === 'rifle' || stance === 'sniper') {
                lElbowY -= 4; rElbowY += 4;
            } else if (stance === 'punch') {
                lElbowY -= 6;
                rElbowY += 6;
            }
            
            // Guard-pose targets, kept so the punch can blend onto them (see step 6)
            const punchGuard = punchStrike !== null ? (h.punchGuard || (h.punchGuard = new Array(8))) : null;
            if (punchGuard) {
                punchGuard[0] = lFistX; punchGuard[1] = lFistY; punchGuard[2] = rFistX; punchGuard[3] = rFistY;
                punchGuard[4] = lElbowX; punchGuard[5] = lElbowY; punchGuard[6] = rElbowX; punchGuard[7] = rElbowY;
            }

            // --- 6. ANIMATION INTERPOLATION ---
            // Smoothly interpolate limb positions to avoid snappy transitions
            const lerpSpeed = config.lerpSpeed || 0.15;
            
            // Initialize animation state on entity if not present
            if (!entity._animState) {
                entity._animState = {
                    lFistX: lFistX, lFistY: lFistY,
                    rFistX: rFistX, rFistY: rFistY,
                    lElbowX: lElbowX, lElbowY: lElbowY,
                    rElbowX: rElbowX, rElbowY: rElbowY,
                    hipRotation: hipRotation,
                    torsoRotation: torsoRotation,
                    bounce: bounce
                };
            }
            
            const anim = entity._animState;
            
            // Lerp function
            const lerp = _humanoidLerp;
            
            // Interpolate hand positions (key for stance transitions)
            anim.lFistX = lerp(anim.lFistX, lFistX, lerpSpeed);
            anim.lFistY = lerp(anim.lFistY, lFistY, lerpSpeed);
            anim.rFistX = lerp(anim.rFistX, rFistX, lerpSpeed);
            anim.rFistY = lerp(anim.rFistY, rFistY, lerpSpeed);
            
            // Interpolate elbow positions
            anim.lElbowX = lerp(anim.lElbowX, lElbowX, lerpSpeed);
            anim.lElbowY = lerp(anim.lElbowY, lElbowY, lerpSpeed);
            anim.rElbowX = lerp(anim.rElbowX, rElbowX, lerpSpeed);
            anim.rElbowY = lerp(anim.rElbowY, rElbowY, lerpSpeed);
            
            // Interpolate body rotations
            anim.hipRotation = lerp(anim.hipRotation, hipRotation, lerpSpeed);
            anim.torsoRotation = lerp(anim.torsoRotation, torsoRotation, lerpSpeed);
            anim.bounce = lerp(anim.bounce, bounce, lerpSpeed * 2); // Bounce can be faster
            
            // Use interpolated values for rendering
            lFistX = anim.lFistX;
            lFistY = anim.lFistY;
            rFistX = anim.rFistX;
            rFistY = anim.rFistY;
            lElbowX = anim.lElbowX;
            lElbowY = anim.lElbowY;
            rElbowX = anim.rElbowX;
            rElbowY = anim.rElbowY;

            // Unarmed walk arm swing, applied AFTER smoothing. The per-render lerp
            // above acts as a low-pass filter: fed an oscillating target it only
            // passed ~34-58% of the swing (less at lower frame rates) and lagged
            // it behind the legs. Arms mirror the opposite leg and scale with
            // stride; the weight fades in/out on stance changes so there's no pop.
            if (anim.armSwingW === undefined) anim.armSwingW = walkArms ? 1 : 0;
            anim.armSwingW = lerp(anim.armSwingW, walkArms ? 1 : 0, lerpSpeed);
            if (anim.armSwingW > 0.001 && strideLen > 0) {
                const handSwing = walkOppSin * strideLen * CONFIG.GAIT.ARM_SWING_RATIO * anim.armSwingW;
                const ls = parcel ? 0.12 : glassHand === 'left' ? 0.25 : 1, rs = parcel ? 0.12 : glassHand === 'right' ? 0.25 : 1;   // keep the drink (or the box) steady
                lFistX += handSwing * ls;
                rFistX -= handSwing * rs;
                lElbowX += handSwing * 0.5 * ls;   // elbow sits midway between shoulder and hand
                rElbowX -= handSwing * 0.5 * rs;
            }
            hipRotation = anim.hipRotation;
            torsoRotation = anim.torsoRotation;
            bounce = anim.bounce;

            // Pistol walk swing, after smoothing: the off hand swings diagonally and the
            // gun hand sways slightly sideways (same amounts as before, now unmuted).
            // Fades in/out on stance changes like the unarmed swing.
            const pistolWalk = !isDriving && stance === 'pistol';
            if (anim.pistolSwingW === undefined) anim.pistolSwingW = pistolWalk ? 1 : 0;
            anim.pistolSwingW = lerp(anim.pistolSwingW, pistolWalk ? 1 : 0, lerpSpeed);
            if (anim.pistolSwingW > 0.001 && armSwing !== 0) {
                const ps = armSwing * 0.5 * anim.pistolSwingW;
                lFistX += ps; lFistY += ps; rFistY += ps;
                lElbowX += ps * 0.5; lElbowY += ps * 0.5; rElbowY += ps * 0.5;  // elbows sit midway
            }

            // Walk sway and bounce on top of the smoothed pose (in step with the legs)
            hipRotation += walkSway;
            torsoRotation -= walkSway;
            bounce += walkBounce;
            // Hit flinch (engine/combat-fx.js sets _hitT): twist away from the blow, head knocked back
            const hitK = entity._hitT !== undefined ? Math.max(0, 1 - (_gameTimeSec - entity._hitT) / 0.18) : 0;
            if (hitK > 0) {
                const side = Math.sin((entity._hitDir || 0) - (entity.angle || 0)) >= 0 ? 1 : -1;
                torsoRotation += hitK * 0.32 * side; hipRotation += hitK * 0.12 * side; bounce -= hitK * 1.6;
            }
            lFistX += walkBounce; rFistX += walkBounce;
            lElbowX += walkBounce; rElbowX += walkBounce;
            if (stance === 'pistol') {
                // The pistol pose's hand targets carry bounce on Y as well
                lFistY += walkBounce; rFistY += walkBounce;
                lElbowY += walkBounce * 0.5; rElbowY += walkBounce * 0.5;
            }

            // Weapon kick for NPC shooters (config.kick 0..1), after smoothing so it isn't muted.
            // Two-handed weapons ride the kick with both hands.
            if (!isDriving && config.kick > 0 && (stance === 'pistol' || stance === 'rifle' || stance === 'sniper')) {
                const kx = config.kick * 6;
                rFistX -= kx; rElbowX -= kx * 0.5;
                if (stance !== 'pistol') { lFistX -= kx; lElbowX -= kx * 0.5; }
            }

            // Punch strike on top of the smoothed guard pose
            if (punchStrike !== null) {
                const P = CONFIG.PUNCH;
                // As the strike builds, blend the hands onto the guard pose, so a punch
                // thrown from a relaxed stance still lands at full reach while the
                // smoothed pose is catching up (at strike 0 nothing changes).
                const k = punchStrike, G = punchGuard;
                lFistX += (G[0] + walkBounce - lFistX) * k;  lFistY += (G[1] - lFistY) * k;
                rFistX += (G[2] + walkBounce - rFistX) * k;  rFistY += (G[3] - rFistY) * k;
                lElbowX += (G[4] + walkBounce - lElbowX) * k; lElbowY += (G[5] - lElbowY) * k;
                rElbowX += (G[6] + walkBounce - rElbowX) * k; rElbowY += (G[7] - rElbowY) * k;

                const reach = punchStrike * P.REACH;
                const pull = punchStrike * P.OFFHAND_PULL;
                // Hands move with the body lean (shoulders already have it via hipAnchorX)
                lFistX -= bodyRecoil; rFistX -= bodyRecoil;
                lElbowX -= bodyRecoil; rElbowX -= bodyRecoil;
                if ((entity.punchSide || 'right') === 'right') {
                    rFistX += reach;  rFistY -= reach * P.CROSS;              // jab crosses inward
                    rElbowX += reach * 0.5; rElbowY -= reach * P.CROSS * 0.5;
                    lFistX -= pull;   lElbowX -= pull * 0.5;                  // other fist pulls back
                    torsoRotation += punchStrike * P.TWIST;                   // twist into the punch
                } else {
                    lFistX += reach;  lFistY += reach * P.CROSS;
                    lElbowX += reach * 0.5; lElbowY += reach * P.CROSS * 0.5;
                    rFistX -= pull;   rElbowX -= pull * 0.5;
                    torsoRotation -= punchStrike * P.TWIST;
                }
            }
            
            // The strike goes on AFTER smoothing, as with punches: a short cut must
            // reach its full pose even when the display only shows a few attack frames.
            if (bladeGame) {
                // A long blade (swing 'wide': Blood Pact) is held in both hands, at guard or mid-sweep
                // (engine/status-effects.js); the left hand rides the grip behind the right
                const pose = bladeWide ? (bladeSwing || wideGrip({ ...WIDE_SWING.guard, twist: 0 })) : bladeSwing;
                if (pose) {
                    rFistX = pose.handX + walkBounce; rFistY = pose.handY;
                    torsoRotation += pose.twist || 0;
                    if (bladeWide) { lFistX = pose.lHandX + walkBounce; lFistY = pose.lHandY; }
                    else lFistX -= Math.max(0, pose.reach) * .2;
                }
                // Elbows bend outward to their own side: the right arm's to her right, the left's to her left
                const ik = (shY, fx, fy, out) => {
                    const sx = shoulderX - shY * Math.sin(torsoRotation), sy = shY * Math.cos(torsoRotation);
                    const dx = fx - sx, dy = fy - sy, d = Math.max(.001, Math.hypot(dx, dy));
                    const bend = Math.sqrt(Math.max(0, 14 * 14 - d * d / 4)) * out;
                    return [(sx + fx) / 2 - dy / d * bend, (sy + fy) / 2 + dx / d * bend];
                };
                [rElbowX, rElbowY] = ik(rShoulderY, rFistX, rFistY, 1);
                if (bladeWide) [lElbowX, lElbowY] = ik(lShoulderY, lFistX, lFistY, -1);
            }

            const drawLimb = h.drawLimb;
            let gunHand = false;                                            // the right hand closes round a drawn weapon
            
            // --- DRAW WEAPON (Behind hands) ---
            // Only draw if player and has a weapon, and NOT driving (driving has its own weapon logic)
            if (!isDriving && entity.type === 'player' && entity._game && entity._game.currentWeapon) {
                const game = entity._game;

                // Step the holster animation toward target (~0.2s of game time, same at any frame rate)
                const target = (game.holsterAnimTarget !== undefined) ? game.holsterAnimTarget : 1;
                if (game.holsterAnim === undefined) { game.holsterAnim = 1; game._holsterT = _gameTimeSec; }
                const hdt = Math.max(0, Math.min(0.1, _gameTimeSec - (game._holsterT ?? _gameTimeSec)));
                game._holsterT = _gameTimeSec;
                const hd = target - game.holsterAnim;
                game.holsterAnim += Math.sign(hd) * Math.min(Math.abs(hd), hdt / 0.2);

                const anim = game.holsterAnim;
                entity._muzzleLocal = null;

                // Skip rendering once fully holstered — weapon is "stowed"
                if (anim > 0.02) {
                    const weaponId = game.currentWeapon.id;
                    gunHand = true;

                    // Lerp from hip-ish stow position back to the fist as anim → 1
                    const hipX = rFistX * 0.4 - 2;
                    const hipY = rFistY * 0.4 + 6;
                    const wx = hipX + (rFistX - hipX) * anim;
                    const wyBase = hipY + ((rFistY - 2) - hipY) * anim;

                    const scale = 0.5 + 0.5 * anim;

                    ctx.save();
                    ctx.globalAlpha = anim;

                    // Draw whenever a weapon mode is active (not from the visual `stance`,
                    // which flips to 'idle' the moment holster is toggled and would skip
                    // the retract). Sniper models sit 2px lower in the hand, matching NPCs.
                    if (game.weaponMode === 'normal' || game.weaponMode === 'sniper') {
                        const wy = wyBase + (weaponId.includes('sniper') ? 2 : 0);
                        const laser = !!(game.inventory && game.inventory.hasAttachment('laser_sight'));
                        // the finisher's twirl (engine/finisher.js): the gun spins round her trigger finger
                        const tw = game.twirlAngle ? game.twirlAngle() : 0;
                        drawWeapon(ctx, weaponId, wx, wy, tw, scale, laser && !tw);
                        // Muzzle in the player's frame — laser sight and shots start here
                        const mz = weaponMuzzleLocal(weaponId);
                        entity._muzzleLocal = { x: wx + mz.x * scale, y: wy + mz.y * scale };
                        entity._muzzleReady = anim > 0.95;
                    } else if (game.weaponMode === 'melee') {
                        // The blade stays in the animated fist, rather than extending
                        // independently from a stationary arm.
                        const ang = bladeSwing ? bladeSwing.a : bladeWide ? WIDE_SWING.guard.a : .35;
                        const wy = hipY + (rFistY - hipY) * anim;
                        drawWeapon(ctx, weaponId, wx, wy, ang, scale * .95, false);
                        entity._muzzleLocal = null; entity._muzzleReady = false;
                    }

                    ctx.restore();
                }
            }
        
            // --- NPC WEAPON (teammates, gangers): the real weapon model, in the gun hand ---
            // config.weapon = { id, ready }. Ready: aimed in the stance's gun hand, like the
            // player's. Not ready: carried at low ready in the right hand, muzzle angled out.
            // The raise/lower eases over ~0.2s of game time (same at any frame rate).
            if (!isDriving && config.weapon && config.weapon.id && entity.type !== 'player') {
                const W = config.weapon, target = W.ready ? 1 : 0;
                gunHand = true;
                if (entity._wpnReady === undefined) { entity._wpnReady = target; entity._wpnT = _gameTimeSec; }
                const dt = Math.max(0, Math.min(0.1, _gameTimeSec - entity._wpnT));
                entity._wpnT = _gameTimeSec;
                const d = target - entity._wpnReady;
                entity._wpnReady += Math.sign(d) * Math.min(Math.abs(d), dt / 0.2);
                const k = entity._wpnReady;
                const yOff = (W.id.includes('sniper') ? 2 : -2) * k;          // matches the player's hand offsets
                const wAng = 0.9 * (1 - k), wScale = 0.8 + 0.2 * k;
                drawWeapon(ctx, W.id, rFistX, rFistY + yOff, wAng, wScale);
                // Muzzle in the actor's frame — shots leave from here (see aimFromMuzzle)
                const mz = weaponMuzzleLocal(W.id), ca = Math.cos(wAng), sa = Math.sin(wAng);
                entity._muzzleLocal = { x: rFistX + (mz.x * ca - mz.y * sa) * wScale, y: rFistY + yOff + (mz.x * sa + mz.y * ca) * wScale };
            }
        
            // Wardrobe pieces for this outfit (see ui/wardrobe.js); unknown types draw as plain colour
            const WD = typeof WARDROBE !== 'undefined' ? WARDROBE : null;
            const topP = WD && clothes.top ? WD.tops[clothes.top.type] : null;
            const sleeve = clothes.top ? (topP ? topP.sleeve : 'long') : 'none';
            // Sleeves can come from the shirt under a vest; legs from trousers under an apron
            const sleeveCol = clothes.top ? (topP && topP.sleeveFrom === 'inner' ? (clothes.top.inner || '#f2f2f2') : topColor(clothes.top)) : null;
            if (isDriving && config.vehiclePose) {
                const q = config.vehiclePose, k = VEHICLE_OCCUPANT_SCALE, side = q.side;
                const sleeveColor = sleeve !== 'none' ? darken(sleeveCol,.15) : skinColor;
                const foreColor = sleeve === 'long' ? darken(sleeveCol,.2) : skinColor;
                const lean = q.lean, torsoY = side * lean * 4 / k;
                const turn = Math.max(-.5, Math.min(.5, q.rel)) * lean;
                // Hips remain at the seat. Only the shoulders and head lean toward the window.
                ctx.save();ctx.translate(0,torsoY);ctx.rotate(turn);
                ctx.fillStyle=darken(clothes.top ? topColor(clothes.top) : skinColor,.1);
                ctx.fill(bodyTorsoPath(BC,1));ctx.restore();
                const sy=side*BC.sh+torsoY;
                const gx=q.gripX/k,gy=q.gripY/k;
                const active=lean>.05;
                const hx=active?gx:13,hy=active?gy:side*4;
                const ex=hx*.48,ey=(sy+hy)*.5;
                drawLimb(0,sy,ex,ey,BC.upper,sleeveColor);
                drawLimb(ex,ey,hx,hy,BC.fore,foreColor);
                ctx.fillStyle=skinColor;drawBodyHand(ctx,ex,ey,hx,hy,true,BC);
                // Driver keeps the other hand forward on the wheel; passengers brace inside.
                const bs=-side*BC.sh+torsoY,bx=q.driver?16:6,by=q.driver?-side*3:-side*6;
                drawLimb(0,bs,6,bs,BC.upper,sleeveColor);drawLimb(6,bs,bx,by,BC.fore,foreColor);
                ctx.fillStyle=skinColor;drawBodyHand(ctx,6,bs,bx,by,true,BC);
                if(active && q.weaponId) drawWeapon(ctx,q.weaponId,gx,gy,q.rel,q.scale/k);
                ctx.save();ctx.translate(0,side*lean*7/k);ctx.rotate(turn);
                const driveDyn=h.driveDyn;driveDyn.android=A;
                withHead(0,hx=>drawHeadAndHair(ctx,hx,skinColor,config.faceDark||'#3e2723',config.faceLight||'#5d4037',clothes.hair,driveDyn,clothes.hat,clothes.jewelry));
                ctx.restore();return;
            }

            if (isDriving) {
                // Driving mode rendering - different poses for shooting vs not shooting
                ctx.save();
                
                // Calculate lean amount for shooting
                const shootLean = isShootingFromCar ? 8 : 0; // Lean forward when shooting
                const headForward = isShootingFromCar ? 6 : 0; // Head moves forward when shooting
                
                ctx.translate(driveOffset - bodyRecoil + shootLean, 0);
                
                // --- TORSO --- (seated: a touch fuller, the lap under it)
                ctx.fillStyle = darken(clothes.top ? topColor(clothes.top) : skinColor, 0.1);
                ctx.fill(bodyTorsoPath(BC, 1));
                
                const sleeveColor = sleeve !== 'none' ? darken(sleeveCol, 0.15) : darken(skinColor, 0.15);
                const skinArmColor = sleeve === 'long' ? darken(sleeveCol, 0.3) : darken(skinColor, 0.3);
                const capColor = sleeve !== 'none' ? darken(sleeveCol, 0.12) : darken(skinColor, 0.12);
                
                if (isShootingFromCar) {
                    // --- SHOOTING POSE ---
                    // Left arm extended out window with weapon
                    // Right arm can stay on wheel or brace
                    
                    // Adjust positions for lean
                    const adjDriveOffset = driveOffset - bodyRecoil - shootLean;
                    
                    // Right arm on wheel (stays relatively normal)
                    const rElbowXAdj = 4;
                    const rElbowYAdj = shoulderSpread + 3;
                    const rFistXAdj = 10;
                    const rFistYAdj = 4;
                    
                    drawLimb(0, rShoulderY, rElbowXAdj, rElbowYAdj, BC.upper, sleeveColor);
                    drawLimb(rElbowXAdj, rElbowYAdj, rFistXAdj, rFistYAdj, BC.fore, skinArmColor);
                    ctx.fillStyle = darken(skinColor, 0.4);
                    drawBodyHand(ctx, rElbowXAdj, rElbowYAdj, rFistXAdj, rFistYAdj, true, BC);
                    
                    // Left arm extended out window (shooting arm)
                    // Arm reaches forward-left out the driver window
                    const lElbowXAdj = 10;
                    const lElbowYAdj = -shoulderSpread - 8;
                    const lFistXAdj = 20 - (recoil * 4); // Recoil pulls back
                    const lFistYAdj = -12;
                    
                    drawLimb(0, lShoulderY, lElbowXAdj, lElbowYAdj, BC.upper, sleeveColor);
                    drawLimb(lElbowXAdj, lElbowYAdj, lFistXAdj, lFistYAdj, BC.fore, skinArmColor);
                    ctx.fillStyle = darken(skinColor, 0.4);
                    drawBodyHand(ctx, lElbowXAdj, lElbowYAdj, lFistXAdj, lFistYAdj, true, BC);
                    
                    // Draw weapon in left hand
                    if (entity.type === 'player' && entity._game && entity._game.currentWeapon) {
                        const weaponId = entity._game.currentWeapon.id;
                        const grip = drivingWeaponGrip(recoil);
                        drawWeapon(ctx, weaponId, grip.x - (driveOffset - bodyRecoil + shootLean), grip.y, 0, grip.scale);
                    }
                    drawBodyCaps(ctx, BC, capColor, lElbowXAdj, lElbowYAdj, rElbowXAdj, rElbowYAdj);
                    
                } else {
                    // --- NORMAL DRIVING POSE (hands on wheel) ---
                    const adjDriveOffset = driveOffset - bodyRecoil;
                    
                    // Both arms forward to steering wheel
                    drawLimb(0, lShoulderY, lElbowX - adjDriveOffset, lElbowY, BC.upper, sleeveColor);
                    drawLimb(0, rShoulderY, rElbowX - adjDriveOffset, rElbowY, BC.upper, sleeveColor);
                    drawLimb(lElbowX - adjDriveOffset, lElbowY, lFistX - adjDriveOffset, lFistY, BC.fore, skinArmColor);
                    drawLimb(rElbowX - adjDriveOffset, rElbowY, rFistX - adjDriveOffset, rFistY, BC.fore, skinArmColor);
                    ctx.fillStyle = darken(skinColor, 0.4);
                    drawBodyHand(ctx, lElbowX - adjDriveOffset, lElbowY, lFistX - adjDriveOffset, lFistY, true, BC);
                    drawBodyHand(ctx, rElbowX - adjDriveOffset, rElbowY, rFistX - adjDriveOffset, rFistY, true, BC);
                    drawBodyCaps(ctx, BC, capColor, lElbowX - adjDriveOffset, lElbowY, rElbowX - adjDriveOffset, rElbowY);
                    // NO weapon drawn when not shooting
                }
                
                // --- HEAD & HAIR ---
                const headX = 0 + headForward;
                const driveDyn = h.driveDyn;
                driveDyn.android = A;
                withHead(headX, hx => drawHeadAndHair(ctx, hx, skinColor, config.faceDark || '#3e2723', config.faceLight || '#5d4037', clothes.hair, driveDyn, clothes.hat, clothes.jewelry));
                
                ctx.restore();
                return;
            }
        
            // --- WALKING MODE ---

            // --- 4. CALCULATE POSITIONS ---
            // Feet stand under the leg roots; the legs hang from the pelvis, so their roots turn with it
            const lBaseY = -BC.leg, rBaseY = BC.leg;
            const hipC = Math.cos(hipRotation), hipS = Math.sin(hipRotation);
            const lHipX = hipAnchorX - lBaseY * hipS, lHipY = lBaseY * hipC, rHipX = hipAnchorX - rBaseY * hipS, rHipY = rBaseY * hipC;
        
            const lWalkX = walkSin * strideLen * fwdAmt;
            const rWalkX = walkOppSin * strideLen * fwdAmt;
            const lWalkY = walkSin * strafeLen * sideAmt;
            const rWalkY = walkOppSin * strafeLen * sideAmt;

            const lFootX = -3 + lWalkX + pf('lf', 0);
            const rFootX = -3 + rWalkX + pf('rf', 0);
            const lFootY = lBaseY + lWalkY + pf('lf', 1);
            const rFootY = rBaseY + rWalkY + pf('rf', 1);

            const lKneeX = (lHipX + lFootX) / 2;
            const lKneeY = (lHipY + lFootY) / 2;
            const rKneeX = (rHipX + rFootX) / 2;
            const rKneeY = (rHipY + rFootY) / 2;
            const botP = WD && clothes.bottom ? WD.bottoms[clothes.bottom.type] : null;
            const shoeP = WD && clothes.shoes ? WD.shoes[clothes.shoes.type] : null;
            const legCol = clothes.bottom ? (clothes.bottom.under || clothes.bottom.color) : null;
            const topGloss = _glossy(topP, clothes.top), botGloss = _glossy(botP, clothes.bottom);
            const headX0 = bounce - bodyRecoil;
            h.clothDyn.wind = W ? W.wind : null;
            let g = h.geometry;
            if (!g) {
                const pair = () => [[0, 0], [0, 0]];
                g = h.geometry = { darken, torso: { x: 0, w: 0 }, hip: { x: 0, w: 0 },
                    feet: pair(), knees: pair(), hipPt: pair(), fists: pair(), elbows: pair(),
                    cloth: (key, spec) => clothGeometry(h.ctx, entity, key, spec, h.clothDyn) };
            }
            g.skin = skinColor; g.gender = gender; g.walkCycle = walkCycle; g.android = A;
            g.torso.x = BC.tb; g.torso.w = BC.tf - BC.tb; g.hip.x = BC.hb; g.hip.w = BC.hf - BC.hb; g.body = BC;
            g.headX = headX0; g.headInTorso = headX0 - hipAnchorX;
            g.feet[0][0] = lFootX; g.feet[0][1] = lFootY; g.feet[1][0] = rFootX; g.feet[1][1] = rFootY;
            g.knees[0][0] = lKneeX; g.knees[0][1] = lKneeY; g.knees[1][0] = rKneeX; g.knees[1][1] = rKneeY;
            g.hipPt[0][0] = lHipX; g.hipPt[0][1] = lHipY; g.hipPt[1][0] = rHipX; g.hipPt[1][1] = rHipY;
            g.fists[0][0] = lFistX; g.fists[0][1] = lFistY; g.fists[1][0] = rFistX; g.fists[1][1] = rFistY;
            g.elbows[0][0] = lElbowX; g.elbows[0][1] = lElbowY; g.elbows[1][0] = rElbowX; g.elbows[1][1] = rElbowY;

            // Floor-layer trains paint before the feet; waist overlays paint after the hips below.
            const groundTrain = WD && clothes.train && WD.trains[clothes.train.type];
            if (groundTrain && !groundTrain.overWaist) {
                ctx.save(); ctx.translate(hipAnchorX, 0); ctx.rotate(torsoRotation * 0.8);
                groundTrain.draw(ctx, g, clothes.train);
                ctx.restore();
            }

            // 1. Feet
            if (shoeP) {
                shoeP.draw(ctx, g, clothes.shoes);
            } else {
                // The foot point (lFootX, lFootY) is the ANKLE, where the calf ends; the heel
                // sits a quarter of the foot behind it (ui/bodies.js bodyFootPath).
                ctx.fillStyle = darken(clothes.shoes ? clothes.shoes.color : skinColor, 0.55);
                drawBodyFoot(ctx, lFootX, lFootY, -1, 0, false, BC.foot);
                drawBodyFoot(ctx, rFootX, rFootY, 1, 0, false, BC.foot);
            }
        
            // LEG COLOURS: which parts of the leg the bottom covers ('bare' | 'thigh' | 'full')
            const legs = clothes.bottom ? (botP ? botP.legs : 'full') : 'bare';
            const legColor = legs === 'full' ? darken(legCol, (botP && botP.shade) || 0.45) : darken(skinColor, 0.15);
            const thighColor = legs !== 'bare' ? darken(legCol, 0.35) : darken(skinColor, 0.05);
        
            // 2. Calves
            drawLimb(lKneeX, lKneeY, lFootX, lFootY, BC.calf, legColor, legs === 'full' && botGloss);
            drawLimb(rKneeX, rKneeY, rFootX, rFootY, BC.calf, legColor, legs === 'full' && botGloss);
            if (shoeP && shoeP.calf && !shoeP.thigh) {                    // boots come up the calf
                const bootColor = darken(clothes.shoes.color, 0.45), c = shoeP.calf;
                drawLimb(lFootX, lFootY, lFootX + (lKneeX - lFootX) * c, lFootY + (lKneeY - lFootY) * c, BOOT_SHAFT, bootColor);
                drawLimb(rFootX, rFootY, rFootX + (rKneeX - rFootX) * c, rFootY + (rKneeY - rFootY) * c, BOOT_SHAFT, bootColor);
            }
        
            // 3. Thighs
            drawLimb(lHipX, lHipY, lKneeX, lKneeY, BC.thigh, thighColor, legs !== 'bare' && botGloss);
            drawLimb(rHipX, rHipY, rKneeX, rKneeY, BC.thigh, thighColor, legs !== 'bare' && botGloss);
            if (A && legs !== 'full') {                                     // android knees
                ctx.strokeStyle = A.trim; ctx.lineWidth = 0.6;
                for (const [x, y] of [[lKneeX, lKneeY], [rKneeX, rKneeY]]) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.stroke(); }
            }
            if (clothes.jewelry && WD) for (const j of clothes.jewelry) {  // tights and stockings, under boots and bands
                const p = WD.jewelry[j.type];
                if (p && p.at === 'legs') p.draw(ctx, g, j, { legs, boot: shoeP && shoeP.calf && !shoeP.thigh ? shoeP.calf : 0 });
            }
            if (botP && botP.detail) botP.detail(ctx, g, clothes.bottom);   // cuffs, pockets, stripes
            if (shoeP && shoeP.thigh) {
                // Paint the entire boot AFTER both bare leg segments: the rounded thigh end must
                // not cover the calf's knee cap. Extend the thigh span by the actual joint radius,
                // not a fraction of the projected length (which approaches zero mid-step).
                const shoe = clothes.shoes, finish = shoe.finish || 'gloss', gloss = finish === 'gloss' || finish === 'sparkle';
                const shade = finish === 'velvet' ? 0.16 : shoe.finish ? 0.22 : 0.45;
                const bootColor = darken(shoe.color, shade), welt = darken(shoe.color, shade + 0.12), t0 = 1 - shoeP.thigh;
                const T = BC.calf, S = [T[0] + 0.3, T[1] + 0.3, T[2], T[3] + 0.3];
                // A limb seen end-on collapses its tapered outline. Keep the complete knee
                // covered even in the passing pose, where hip, knee and ankle coincide.
                ctx.fillStyle = bootColor; ctx.beginPath();
                const kneeR = Math.max(BC.thigh[3], BC.calf[0]) + 0.3;
                ctx.arc(lKneeX, lKneeY, kneeR, 0, Math.PI * 2);
                ctx.moveTo(rKneeX + kneeR, rKneeY); ctx.arc(rKneeX, rKneeY, kneeR, 0, Math.PI * 2);
                ctx.fill(); ctx.beginPath();
                drawLimb(lKneeX, lKneeY, lFootX, lFootY, S, bootColor, gloss);
                drawLimb(rKneeX, rKneeY, rFootX, rFootY, S, bootColor, gloss);
                for (const [hx, hy, kx, ky] of [[lHipX, lHipY, lKneeX, lKneeY], [rHipX, rHipY, rKneeX, rKneeY]]) {
                    const end = 1 + (BC.thigh[3] + 0.3) / Math.max(1e-6, Math.hypot(kx - hx, ky - hy));
                    fillLimbSpan(ctx, hx, hy, kx, ky, BC.thigh, t0, end, 0.3, bootColor, gloss);
                    fillLimbSpan(ctx, hx, hy, kx, ky, BC.thigh, t0, t0 + 0.05, 0.35, welt);
                }
                if (shoeP.fabric) shoeP.fabric(ctx, g, shoe);
            }
            if (clothes.jewelry && WD) for (const j of clothes.jewelry) {  // thigh bands
                const p = WD.jewelry[j.type]; if (p && p.at === 'thighs') p.draw(ctx, g, j);
            }
        
            // 4. Hips & Skirt
            ctx.save(); ctx.translate(hipAnchorX, 0); ctx.rotate(hipRotation);
        
            // Base Hips
            ctx.fillStyle = darken(clothes.bottom ? clothes.bottom.color : skinColor, 0.2);
            ctx.fill(bodyHipPath(BC));
        
            // Skirts and other hip overlays (same geometry as the hips)
            if (botP && botP.hips) botP.hips(ctx, g, clothes.bottom);
            ctx.restore();
        
            // Crimson Flame attaches over the waist, before arms and the upper body.
            if (groundTrain && groundTrain.overWaist) {
                ctx.save(); ctx.translate(hipAnchorX, 0); ctx.rotate(torsoRotation * 0.8);
                groundTrain.draw(ctx, g, clothes.train);
                ctx.restore();
            }

            // 5. Trains (Dress Train)
            if (clothes.train) {
                ctx.save(); ctx.translate(hipAnchorX, 0); ctx.rotate(torsoRotation * 0.8);
                if (clothes.train.type === 'dress_train') {
                    // Two heavy panels trailing from the hips
                    for (const s of [-1, 1]) {
                        const panel = g.cloth(s < 0 ? 'train_l' : 'train_r', { segs: 4, stiffness: 0.07, damping: 0.9, chains: [
                            { a: { x: BC.hb + 2, y: s * 10 }, t: { x: -30, y: s * 14 } },
                            { a: { x: BC.hb + 2, y: s * 6 },  t: { x: -30, y: s * 8 } },
                            { a: { x: BC.hb + 2, y: s * 2 },  t: { x: -30, y: s * 2 } } ] });
                        drawClothPanel(ctx, panel, darken(clothes.train.color, 0.1));
                    }
                } else if (clothes.train.type === 'silk_flow') {
                    // Periwinkle silk: light, floaty, never quite still
                    const panel = g.cloth('train_silk', { segs: 5, stiffness: 0.045, damping: 0.93, drift: 0.25, chains: [
                        { a: { x: BC.hb + 2, y: -10 }, t: { x: -36, y: -12 } },
                        { a: { x: BC.hb + 2, y: -5 },  t: { x: -42, y: -2 } },
                        { a: { x: BC.hb + 2, y: 0 },   t: { x: -40, y: 8 } } ] });
                    ctx.globalAlpha = 0.9;
                    drawClothPanel(ctx, panel, clothes.train.color);
                    ctx.globalAlpha = 1.0;
                }

                ctx.restore();
            }
        
            // 5b. Coat tails
            if (topP && topP.tail) {
                ctx.save(); ctx.translate(hipAnchorX, 0); ctx.rotate(torsoRotation * 0.8);
                topP.tail(ctx, g, clothes.top);
                ctx.restore();
            }

            // 6. Hands, turned along the forearm: a fist round whatever they hold (a pistol's off hand stays relaxed)
            ctx.fillStyle = darken(skinColor, 0.4);
            const bothGrip = stance === 'rifle' || stance === 'sniper' || stance === 'punch';
            drawBodyHand(ctx, lElbowX, lElbowY, lFistX, lFistY, bothGrip || glassHand === 'left', BC);
            drawBodyHand(ctx, rElbowX, rElbowY, rFistX, rFistY, bothGrip || stance === 'pistol' || gunHand || glassHand === 'right', BC);
        
            // 7. Forearms (fabric only under long sleeves), with whatever passes under the wrists beneath them
            if (clothes.jewelry && WD) for (const j of clothes.jewelry) {
                const p = WD.jewelry[j.type]; if (p && p.under) p.under(ctx, g, j);
            }
            const foreColor = sleeve === 'long' ? darken(sleeveCol, 0.3) : darken(skinColor, 0.3);
            drawLimb(lElbowX, lElbowY, lFistX, lFistY, BC.fore, foreColor, sleeve === 'long' && topGloss);
            drawLimb(rElbowX, rElbowY, rFistX, rFistY, BC.fore, foreColor, sleeve === 'long' && topGloss);
            if (clothes.jewelry && WD) for (const j of clothes.jewelry) {
                const p = WD.jewelry[j.type]; if (p && p.at === 'wrists') p.draw(ctx, g, j);
            }
            if (A) {                                                        // android wrists: the seam over the top of each
                ctx.strokeStyle = A.trim; ctx.lineWidth = 0.6; ctx.beginPath();
                for (let i = 0; i < 2; i++) {
                    const [ex, ey] = g.elbows[i], [fx, fy] = g.fists[i];
                    bodyRingHalf(ctx, fx, fy, BC.fore[3], Math.atan2(fy - ey, fx - ex), bodyForearmReach(Math.hypot(fx - ex, fy - ey)), 1);
                }
                ctx.stroke();
            }
        
            // 8. Upper Arms (fabric under short or long sleeves). They hang from the shoulders, so their
            // roots turn with the torso: forward with the opposite leg on a step, into the blow in a punch.
            const upperColor = sleeve !== 'none' ? darken(sleeveCol, 0.15) : darken(skinColor, 0.15);
            const torC = Math.cos(torsoRotation), torS = Math.sin(torsoRotation);
            const lShX = shoulderX - lShoulderY * torS, lShY = lShoulderY * torC, rShX = shoulderX - rShoulderY * torS, rShY = rShoulderY * torC;
            drawLimb(lShX, lShY, lElbowX, lElbowY, BC.upper, upperColor, sleeve !== 'none' && topGloss);
            drawLimb(rShX, rShY, rElbowX, rElbowY, BC.upper, upperColor, sleeve !== 'none' && topGloss);
            if (A) {                                                        // android elbows: a round joint plate on each
                ctx.strokeStyle = A.trim; ctx.lineWidth = 0.6;
                for (const [x, y] of [[lElbowX, lElbowY], [rElbowX, rElbowY]]) { ctx.beginPath(); ctx.arc(x, y, 1.9, 0, Math.PI * 2); ctx.stroke(); }
            }
            if (topP && topP.armStripe) {                                // track-jacket stripes down the sleeves
                ctx.strokeStyle = clothes.top.trim || '#f5f5f5'; ctx.lineWidth = 0.8; ctx.beginPath();
                ctx.moveTo(lShX, lShY); ctx.lineTo(lElbowX, lElbowY); ctx.lineTo(lFistX, lFistY);
                ctx.moveTo(rShX, rShY); ctx.lineTo(rElbowX, rElbowY); ctx.lineTo(rFistX, rFistY);
                ctx.stroke();
            }
        
            // 9. Torso
            ctx.save(); ctx.translate(hipAnchorX, 0); ctx.rotate(torsoRotation);
            
            ctx.fillStyle = darken(skinColor, 0.1);
            ctx.fill(bodyTorsoPath(BC));
        
            if (BC.bust && !clothes.top) {
                ctx.fillStyle = darken(skinColor, 0.15);
                for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(BC.bust.x, s * BC.bust.y, BC.bust.r, 0, Math.PI*2); ctx.fill(); }
            }
        
            if (clothes.top) {
                if (topP) topP.draw(ctx, g, clothes.top);
                else { ctx.fillStyle = darken(topColor(clothes.top), 0.1); ctx.fill(bodyTorsoPath(BC)); }
            }
            // The shoulders: deltoid caps over the torso's edge in the sleeve's colour (bare in a tank
            // top), leaning toward the elbows (brought into the torso's frame)
            {
                const lx = lElbowX - hipAnchorX, rx = rElbowX - hipAnchorX;
                drawBodyCaps(ctx, BC, sleeve !== 'none' ? darken(sleeveCol, 0.12) : darken(skinColor, 0.12),
                    lx * torC + lElbowY * torS, -lx * torS + lElbowY * torC, rx * torC + rElbowY * torS, -rx * torS + rElbowY * torC,
                    topP && topP.padded || 0, topP && topP.armStripe ? clothes.top.trim || '#f5f5f5' : null, !!(topP && topP.seams));
            }
            if (topP && topP.collar) topP.collar(ctx, g, clothes.top);       // hood, turtleneck, coat collar
            if (clothes.jewelry && WD) for (const j of clothes.jewelry) {
                const p = WD.jewelry[j.type]; if (p && p.at === 'neck') p.draw(ctx, g, j);
            }
            if (SH && SH.body) {                                            // the torso's form: soft shade on the side away from the sun
                const cx = (BC.tb + BC.tf) * 0.5, span = (BC.sh + BC.del) * 1.3;
                if (SH.lx || SH.ly) _softSpot(ctx, cx - SH.lx * 2.5, -SH.ly * span * 0.44, (BC.tf - BC.tb) * 1.5, span, _SHADOW_RGB, SH.shA * 1.3);
                if (topGloss) {                                             // glossy fabric: a crisp ridge across the shoulders too
                    ctx.fillStyle = SH.hl2;
                    ctx.beginPath(); ctx.roundRect(cx - 1.4 + SH.lx * 1.5, -BC.sh * 0.8 + SH.ly * 1.5, 2.8, BC.sh * 1.6, 1.4); ctx.fill();
                }
            }
            if (A && !clothes.top) {                                        // bare plating: chest panel seams and the Double Nights mark
                ctx.strokeStyle = A.trim; ctx.lineWidth = 0.6; ctx.beginPath();
                ctx.moveTo(BC.tb + 1.2, 0); ctx.lineTo(BC.tf - 1, 0);
                for (const s of [-1, 1]) { ctx.moveTo(BC.tb + 2, s * BC.back * 0.75); ctx.lineTo(BC.tf - 2.6, s * BC.chest * 0.8); }
                ctx.stroke();
                if (A.emblem) drawDNEmblem(ctx, BC.tf - 3.2, -BC.chest * 0.45, 2, A.glow);
            }
            ctx.restore();
        
            // 10. Head & Hair
            // In strong wind the head dips into it (toward where it's blowing from)
            const windLocal = W ? W.dir - (entity.angle || 0) : 0, dip = W ? W.strong * 1.3 : 0;
            // Scoped (engine/scope.js): cheek down to the stock, head tipped toward the sight
            const scopeK = config.scopeK || 0;
            const headX = 0 + bounce - bodyRecoil + pf('head', 0) - Math.cos(windLocal) * dip + scopeK * 3.5;
            const headY = pf('head', 1) - Math.sin(windLocal) * dip + scopeK * 3, headTurn = (pose ? (pose.turn || 0) * poseW : 0) + scopeK * 0.18;   // looking around
            // 1.0 at the player's base walk speed — keeps the old player hair tuning, now shared by everyone
            const hairMove = gaitSpeed / 5.2;
            // Hair motion comes from the strand physics (hairGeometry): the owner's head
            // position in the world, plus the shoulder sway the strands swing with.
            const walkDyn = h.walkDyn;
            walkDyn.sway = torsoRotation; walkDyn.wind = W ? W.hairWind : null; walkDyn.android = A;
            const turning = headY !== 0 || headTurn !== 0;
            withHead(headX, hx => {
                if (turning) { ctx.save(); ctx.translate(hx, headY); ctx.rotate(headTurn); ctx.translate(-hx, 0); }
                drawHeadAndHair(ctx, hx, skinColor, config.faceDark || '#3e2723', config.faceLight || '#5d4037', clothes.hair, walkDyn, clothes.hat, clothes.jewelry);
                if (SH && SH.level > 1 && (SH.lx || SH.ly)) {               // the head as a matte dome: hair gradients in its own colour, then shade away from the sun
                    const ht = clothes.hair && !clothes.hat ? _hairTone(clothes.hair.color) : null;
                    if (ht) { const s = ht.up ? 1 : -1; _softSpot(ctx, hx + s * SH.lx * 3, s * SH.ly * 3, 13, 13, ht.rgb, 0.55 * Math.hypot(SH.lx, SH.ly)); }
                    _softSpot(ctx, hx - SH.lx * 3.5, -SH.ly * 3.5, 13, 13, _SHADOW_RGB, SH.shA * (SH.body ? 1.3 : 0.9));
                }
                if (turning) ctx.restore();
            });
            if (SH && SH.rim) {                                             // a street lamp's colour catching shoulder and head
                const r = SH.rim.ang;
                ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = SH.rim.style; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
                const rimX = 9.5, rimY = BC.sh + BC.del * 0.55, rt = Math.atan2(rimX * Math.sin(r), rimY * Math.cos(r));   // round the shoulders
                ctx.beginPath(); ctx.ellipse(-1.5, 0, rimX, rimY, 0, rt - 0.75, rt + 0.75);
                const crown = clothes.hair && !clothes.hat ? HAIR_CROWNS[clothes.hair.type] : null;     // round the hair, not the scalp under it
                const hcx = headX + (crown ? crown[0] : 0), hr = crown ? Math.max(crown[1], crown[2]) - 0.3 : 8.5;
                ctx.moveTo(hcx + Math.cos(r - 1.1) * hr, Math.sin(r - 1.1) * hr); ctx.arc(hcx, 0, hr, r - 1.1, r + 1.1);
                ctx.strokeStyle = SH.rim.soft; ctx.lineWidth = 3.6; ctx.stroke();          // the light wrapping round, soft
                ctx.strokeStyle = SH.rim.style; ctx.lineWidth = 1.2; ctx.stroke();         // … and its bright edge
                // The lit side of the head and shoulder takes on the lamp's colour
                _softSpot(ctx, hcx + Math.cos(r) * hr * 0.6, Math.sin(r) * hr * 0.6, 15, 15, SH.rim.rgb, SH.rim.k * 0.4);
                _softSpot(ctx, -1.5 + Math.cos(rt) * rimX * 0.7, Math.sin(rt) * rimY * 0.7, 12, 12, SH.rim.rgb, SH.rim.k * 0.3);
                ctx.restore();
            }
            if (hitK > 0.05) {                                              // the flash of the hit
                ctx.save(); ctx.globalCompositeOperation = 'lighter';       // a cached glow (lightning flashes every body outdoors at once)
                ctx.globalAlpha *= 0.45 * hitK; drawGlow(ctx, headX * 0.5, 0, 15, '255, 235, 235', 0);
                ctx.restore();
            }
        
            // 11. HELD ITEMS
            if (held) {
                let hX, hY;
                if (held.hand === 'left') { hX = lFistX; hY = lFistY; } else { hX = rFistX; hY = rFistY; }
                // 'champagne_glass' is the legacy id (NPC configs); it's the glass with champagne
                if (held.type === 'glass' || held.type === 'champagne_glass') {
                    drawHeldGlass(ctx, hX, hY, held.drink || 'champagne', entity, held.hand, held.mirror, held.level ?? 1);
                } else if (held.type === 'parcel' && held.tucked && !isDrivingCfg(config)) {
                    ctx.save(); ctx.translate(-1.5, -12.5); ctx.rotate(0.12);           // against her left side, under the arm
                    drawCozyParcel(ctx, 10, 6.5, 0.6);
                    ctx.restore();
                } else if (parcel) {
                    // The box between her hands, a little ahead of them, then her fingertips over its sides
                    const bx = (lFistX + rFistX) / 2 + 4, by = (lFistY + rFistY) / 2, lat = Math.max(10, rFistY - lFistY - 0.6);
                    ctx.save(); ctx.translate(bx, by);
                    drawCozyParcel(ctx, 11, lat, 0.75);
                    ctx.restore();
                    ctx.fillStyle = skinColor;
                    for (const [fx, fy] of [[lFistX + 1.6, lFistY + 0.9], [rFistX + 1.6, rFistY - 0.9]]) { ctx.beginPath(); ctx.ellipse(fx, fy, 1.7, 1.2, 0, 0, Math.PI * 2); ctx.fill(); }
                } else if (umbrella) {
                    // Canopy over the head, held a little into the wind, bobbing with the step
                    const lean = W ? 2.5 + W.strong * 3 : 0;
                    const ux = headX * 0.5 - Math.cos(windLocal) * lean + Math.sin(walkCycle * 2) * 0.5, uy = -Math.sin(windLocal) * lean;
                    const eased = entity._umbOpen = (entity._umbOpen === undefined ? umbrellaOpen : entity._umbOpen + (umbrellaOpen - entity._umbOpen) * 0.12);
                    drawUmbrella(ctx, ux, uy, hX, hY, eased, umbrella);
                }
            }
            
            // DEBUG: Red circle at entity center point
            if (!entity._reflectionProxy && typeof game !== 'undefined' && game.dbg && game.dbg('colliders')) {
                ctx.fillStyle = 'rgba(255, 106, 184, 0.9)';
                ctx.beginPath();
                ctx.arc(0, 0, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        /**
         * A glass held in hand, seen from above. The rim, liquid and highlights are
         * drawn as circles; highlights are pinned to the screen's upper-left (the
         * glass turns with the body, the light doesn't). The drink sloshes a little
         * when the hand moves (a small spring in world space, stepped on game time).
         * Keeps the original sparkle: an occasional star glint on the rim.
         */
        function isDrivingCfg(config) { return !!(config && config.isDriving); }

        /** What a delivery in someone's hands is (drawProceduralHumanoid's `held`) */
        const PARCEL_HELD = Object.freeze({ type: 'parcel' });
        /** …and tucked under her left arm, when her hands are on a gun */
        const PARCEL_TUCKED = Object.freeze({ type: 'parcel', tucked: true });

        /**
         * A Cozy Cafe delivery box, seen from above, centred on the origin: w along the carrier's facing (x), h across.
         * Kraft card with its flaps' seam, a cocoa band round it with cream stitching, the cafe's round sticker (a cup,
         * steam rising) and a heart tape tab on the near end. `shade` (0..1) darkens its side for the light.
         */
        function drawCozyParcel(ctx, w, h, shade = 1) {
            const x0 = -w / 2, y0 = -h / 2, u = Math.min(w, h);
            ctx.fillStyle = `rgba(70, 38, 16, ${0.75 * shade})`; ctx.fillRect(x0 + u * 0.06, y0 + u * 0.09, w, h);      // its side, in shade
            const g = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h);
            g.addColorStop(0, '#e2b27a'); g.addColorStop(0.55, '#cf9658'); g.addColorStop(1, '#b37a40');
            ctx.fillStyle = g; ctx.fillRect(x0, y0, w, h);                                                   // kraft card
            ctx.strokeStyle = 'rgba(255, 238, 210, 0.5)'; ctx.lineWidth = u * 0.045; ctx.strokeRect(x0 + u * 0.03, y0 + u * 0.03, w - u * 0.06, h - u * 0.06);
            ctx.strokeStyle = 'rgba(110, 62, 26, 0.55)'; ctx.lineWidth = u * 0.04;                          // the flaps' seam
            ctx.beginPath(); ctx.moveTo(x0 + u * 0.05, 0); ctx.lineTo(x0 + w - u * 0.05, 0); ctx.stroke();
            const bw = w * 0.2;                                                                               // the cocoa band across
            ctx.fillStyle = '#4a2416'; ctx.fillRect(-bw / 2, y0, bw, h);
            ctx.strokeStyle = 'rgba(255, 228, 190, 0.75)'; ctx.lineWidth = u * 0.03; ctx.setLineDash([u * 0.07, u * 0.06]);
            ctx.beginPath(); ctx.moveTo(-bw / 2 + u * 0.05, y0); ctx.lineTo(-bw / 2 + u * 0.05, y0 + h); ctx.moveTo(bw / 2 - u * 0.05, y0); ctx.lineTo(bw / 2 - u * 0.05, y0 + h); ctx.stroke();
            ctx.setLineDash([]);
            const r = u * 0.27;                                                                               // the cafe's sticker
            ctx.fillStyle = '#fbf0dc'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#c4874a'; ctx.lineWidth = u * 0.035; ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#6b3a1f';                                                                        // a cup with a handle
            ctx.beginPath(); ctx.moveTo(-r * 0.42, -r * 0.05); ctx.lineTo(r * 0.3, -r * 0.05); ctx.lineTo(r * 0.2, r * 0.45); ctx.lineTo(-r * 0.32, r * 0.45); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#6b3a1f'; ctx.lineWidth = u * 0.03; ctx.beginPath(); ctx.arc(r * 0.34, r * 0.17, r * 0.14, -Math.PI / 2, Math.PI / 2); ctx.stroke();
            ctx.strokeStyle = '#e0913a'; ctx.lineWidth = u * 0.028; ctx.lineCap = 'round';                   // steam
            for (const sx of [-r * 0.18, r * 0.08]) { ctx.beginPath(); ctx.moveTo(sx, -r * 0.15); ctx.quadraticCurveTo(sx + r * 0.16, -r * 0.35, sx, -r * 0.55); ctx.stroke(); }
            ctx.lineCap = 'butt';
            ctx.fillStyle = '#e8485e';                                                                        // the heart tab on the near end
            const hx = x0 + w - u * 0.12, hs = u * 0.075;
            ctx.beginPath(); ctx.arc(hx - hs * 0.2, -hs * 0.55, hs * 0.7, 0, Math.PI * 2); ctx.arc(hx - hs * 0.2, hs * 0.55, hs * 0.7, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(hx - hs * 0.6, -hs * 1.1); ctx.lineTo(hx + hs * 1.1, 0); ctx.lineTo(hx - hs * 0.6, hs * 1.1); ctx.closePath(); ctx.fill();
        }

        function drawHeldGlass(ctx, hX, hY, drinkId, owner, hand, mirror = false, level = 1) {
            const D = GLASS_DRINKS[drinkId] || GLASS_DRINKS.champagne;
            const TAU = Math.PI * 2, R = D.rim;
            const side = hand === 'left' ? -1 : 1;
            const gx = hX + 1.5, gy = hY + side * 3.5;          // just past the fingers
            if (D.glass === 'mug') {                            // a ceramic mug (the cafe's): the cup, its handle, the drink, a heart in the foam
                ctx.save(); ctx.translate(gx, gy);
                ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.arc(0.9, 1.1, R * 1.05, 0, TAU); ctx.fill();
                ctx.strokeStyle = D.cup; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(R * 1.05, side * 0.4, R * 0.45, -1.3, 1.3); ctx.stroke();
                ctx.fillStyle = D.cup; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.4; ctx.stroke();
                ctx.fillStyle = D.liquid; ctx.beginPath(); ctx.arc(0, 0, R * 0.76, 0, TAU); ctx.fill();
                if (D.art) { ctx.fillStyle = 'rgba(250,238,222,0.9)'; ctx.beginPath(); ctx.arc(-0.7, -0.4, R * 0.24, 0, TAU); ctx.arc(0.7, -0.4, R * 0.24, 0, TAU); ctx.fill();
                             ctx.beginPath(); ctx.moveTo(-1.6, 0); ctx.lineTo(0, 1.9); ctx.lineTo(1.6, 0); ctx.closePath(); ctx.fill(); }
                if (D.foam) { ctx.fillStyle = 'rgba(250,240,230,0.85)'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(Math.cos(i * 1.7) * R * 0.32, Math.sin(i * 1.7) * R * 0.32, R * 0.2, 0, TAU); ctx.fill(); } }
                if (D.crema) { ctx.fillStyle = 'rgba(200,140,70,0.75)'; ctx.beginPath(); ctx.arc(0, 0, R * 0.5, 0, TAU); ctx.fill(); }
                ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(-R * 0.45, -R * 0.45, R * 0.18, 0, TAU); ctx.fill();
                ctx.restore();
                return;
            }
            const T = ctx.getTransform();
            const light = -Math.PI * 0.75 - Math.atan2(T.b, T.a);  // toward screen upper-left, in local space
            const lx = Math.cos(light), ly = Math.sin(light);

            // Slosh: the liquid lags the glass's motion through the world
            let sx = 0, sy = 0;
            if (owner && _worldMatrix && ctx.canvas === _worldCanvas) {
                const M = _worldMatrix.inverse().multiply(T);
                const wx = M.a * gx + M.c * gy + M.e, wy = M.b * gx + M.d * gy + M.f;
                let s = owner._glassSlosh;
                if (!s || Math.hypot(s.x - wx, s.y - wy) > 60) s = owner._glassSlosh = { x: wx, y: wy, vx: 0, vy: 0, t: _gameTimeSec, acc: 0 };
                s.acc += Math.max(0, _gameTimeSec - s.t) * 120; s.t = _gameTimeSec;
                let n = Math.min(12, Math.floor(s.acc)); s.acc -= Math.floor(s.acc);
                while (n-- > 0) { s.vx = (s.vx + (wx - s.x) * 0.18) * 0.8; s.vy = (s.vy + (wy - s.y) * 0.18) * 0.8; s.x += s.vx; s.y += s.vy; }
                // world offset → local offset (inverse of M's linear part)
                const det = M.a * M.d - M.b * M.c, ox = s.x - wx, oy = s.y - wy;
                sx = (M.d * ox - M.c * oy) / det * 0.35; sy = (-M.b * ox + M.a * oy) / det * 0.35;
                const sm = Math.hypot(sx, sy), cap = R * 0.22;
                if (sm > cap) { sx *= cap / sm; sy *= cap / sm; }
            }

            ctx.save();
            ctx.translate(gx, gy);
            const a0 = ctx.globalAlpha;

            // Contact shadow, cast away from the light
            ctx.fillStyle = 'rgba(0,0,0,0.28)';
            ctx.beginPath(); ctx.arc(-lx * 1.4, -ly * 1.4, R * 1.02, 0, TAU); ctx.fill();

            // Foot of stemmed glasses peeks out on the shadow side (a hint of the stem below)
            if (D.glass !== 'tumbler' && D.glass !== 'soda') {
                ctx.strokeStyle = 'rgba(220,240,255,0.35)'; ctx.lineWidth = 0.5;
                ctx.beginPath(); ctx.arc(-lx * 1.1, -ly * 1.1, R * 0.78, 0, TAU); ctx.stroke();
            }

            // Glass body: faint cool tint
            ctx.fillStyle = 'rgba(210,235,255,0.16)';
            ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();

            // Liquid — darker at the edge, brighter toward the light (depth)
            const lr = R * (D.glass === 'martini' ? 0.8 : (D.glass === 'tumbler' || D.glass === 'soda') ? 0.78 : D.glass === 'flute' ? 0.7 : 0.74)
                     * (0.4 + 0.6 * Math.min(1, level));             // a lower pour sits deeper in the bowl: a smaller round seen from above
            if (level > 0.02) {                                 // (a dry glass: just the glass)
                const g = ctx.createRadialGradient(sx + lx * lr * 0.35, sy + ly * lr * 0.35, 0, sx, sy, lr);
                g.addColorStop(0, D.liquid2 ? '#ffffff' : lightenHex(D.liquid, 70));
                g.addColorStop(0.35, D.liquid);
                g.addColorStop(1, D.liquid2 || darkenHex(D.liquid, 40));
                if (D.glow) { ctx.shadowColor = D.liquid; ctx.shadowBlur = 6; }
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(sx, sy, lr, 0, TAU); ctx.fill();
                ctx.shadowBlur = 0;
                // Meniscus: a bright hairline where liquid meets glass
                ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.35;
                ctx.beginPath(); ctx.arc(sx, sy, lr, 0, TAU); ctx.stroke();

                const t = _gameTimeSec;
                if (D.foam) {                                       // creamy head around the edge
                    ctx.fillStyle = 'rgba(255,246,240,0.9)';
                    for (let i = 0; i < 10; i++) {
                        const a = (i / 10) * Math.PI * 2 + 0.3;
                        ctx.beginPath(); ctx.arc(sx + Math.cos(a) * lr * 0.82, sy + Math.sin(a) * lr * 0.82, lr * (0.2 + (i % 3) * 0.04), 0, Math.PI * 2); ctx.fill();
                    }
                }
                if (D.bubbles) {                                   // rising bubbles
                    ctx.fillStyle = 'rgba(255,255,255,0.85)';
                    for (let i = 0; i < 4; i++) {
                        const ph = (t * 0.8 + i * 0.27) % 1;
                        const ang = i * 2.1 + t * 0.6;
                        const rr = lr * (0.15 + 0.55 * ph);
                        ctx.globalAlpha = a0 * (1 - ph) * 0.9;
                        ctx.beginPath(); ctx.arc(sx + Math.cos(ang) * rr, sy + Math.sin(ang) * rr, 0.35, 0, TAU); ctx.fill();
                    }
                    ctx.globalAlpha = a0;
                }
                if (D.ice) {                                        // two cubes, drifting slowly
                    for (let i = 0; i < 2; i++) {
                        const ang = t * 0.5 + i * Math.PI, rr = lr * 0.35;
                        ctx.save(); ctx.translate(sx + Math.cos(ang) * rr, sy + Math.sin(ang) * rr); ctx.rotate(ang * 0.7 + i);
                        ctx.fillStyle = 'rgba(235,248,255,0.55)'; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.3;
                        ctx.beginPath(); ctx.roundRect(-1.1, -1.1, 2.2, 2.2, 0.5); ctx.fill(); ctx.stroke();
                        ctx.restore();
                    }
                }
            }
            if (D.garnish === 'olive') {                        // olive on a pick
                ctx.strokeStyle = '#d9c38a'; ctx.lineWidth = 0.35;
                ctx.beginPath(); ctx.moveTo(R * 0.95, -R * 0.35); ctx.lineTo(-R * 0.1, R * 0.15); ctx.stroke();
                ctx.fillStyle = '#6d8b2f'; ctx.beginPath(); ctx.arc(R * 0.2, 0, 1.1, 0, TAU); ctx.fill();
                ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(R * 0.2 + 0.35, -0.2, 0.4, 0, TAU); ctx.fill();
            }
            if (D.garnish === 'citrus') {                       // citrus wheel on the rim
                ctx.save(); ctx.translate(-lx * R * 0.9, -ly * R * 0.9);
                ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, TAU); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.25;
                for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 1.3, Math.sin(a) * 1.3); ctx.lineTo(-Math.cos(a) * 1.3, -Math.sin(a) * 1.3); ctx.stroke(); }
                ctx.restore();
            }

            if (D.straw) {                                      // striped straw leaning out over the rim
                const sa = light + Math.PI * 0.8, x0 = sx + Math.cos(sa) * lr * 0.2, y0 = sy + Math.sin(sa) * lr * 0.2;
                const x1 = Math.cos(sa) * R * 1.35, y1 = Math.sin(sa) * R * 1.35;
                ctx.lineCap = 'round'; ctx.lineWidth = 0.9;
                ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
                ctx.strokeStyle = D.straw; ctx.setLineDash([0.8, 0.8]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
                ctx.setLineDash([]); ctx.lineCap = 'butt';
            }

            // Inner refraction line (the glass wall seen edge-on), darker on the far side
            ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.4;
            ctx.beginPath(); ctx.arc(-lx * 0.3, -ly * 0.3, R * 0.9, light + Math.PI * 0.35, light + Math.PI * 1.65); ctx.stroke();
            // Rim
            ctx.strokeStyle = 'rgba(245,252,255,0.85)'; ctx.lineWidth = D.glass === 'tumbler' ? 1.1 : D.glass === 'soda' ? 0.8 : 0.55;
            ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
            if (D.glass === 'tumbler' || D.glass === 'soda') {  // thick glass: second inner ring
                ctx.strokeStyle = 'rgba(245,252,255,0.35)'; ctx.lineWidth = 0.4;
                ctx.beginPath(); ctx.arc(0, 0, R * 0.84, 0, TAU); ctx.stroke();
            }
            if (mirror) {                                       // the Mirrored Glass: a silvered band round the rim, a bright arc of it toward the light
                ctx.strokeStyle = '#8f9aa8'; ctx.lineWidth = 1.1;
                ctx.beginPath(); ctx.arc(0, 0, R + 0.5, 0, TAU); ctx.stroke();
                ctx.strokeStyle = '#f4f8ff'; ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.arc(0, 0, R + 0.5, light - 0.9, light + 0.9); ctx.stroke();
                ctx.strokeStyle = 'rgba(40,48,64,0.6)'; ctx.lineWidth = 0.6;
                ctx.beginPath(); ctx.arc(0, 0, R + 0.5, light + Math.PI - 0.6, light + Math.PI + 0.6); ctx.stroke();
            }
            // Specular crescent + pin highlight on the lit side
            ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 0.7; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(0, 0, R * 0.8, light - 0.55, light + 0.35); ctx.stroke();
            ctx.lineCap = 'butt';
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(lx * R * 0.45, ly * R * 0.45, 0.45, 0, TAU); ctx.fill();

            // The sparkle: an occasional four-point glint on the rim
            const phase = owner && owner._glintPhase !== undefined ? owner._glintPhase : (owner ? (owner._glintPhase = Math.random() * 60) : 0);
            if (Math.sin(_frameTime / 100 + phase) > 0.95) {
                ctx.save(); ctx.translate(lx * R, ly * R);
                ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 5;
                ctx.beginPath();
                ctx.moveTo(0, -2.4); ctx.lineTo(0.45, -0.45); ctx.lineTo(2.4, 0); ctx.lineTo(0.45, 0.45);
                ctx.lineTo(0, 2.4); ctx.lineTo(-0.45, 0.45); ctx.lineTo(-2.4, 0); ctx.lineTo(-0.45, -0.45);
                ctx.closePath(); ctx.fill();
                ctx.restore();
            }
            ctx.globalAlpha = a0;
            ctx.restore();
        }

        /**
         * A weapon from its model (ui/weapon-models.js): one baked sprite, then its emitters
         * glowing live. Used for guns in hand (player, NPCs, the drive-by) and dropped loot.
         * `laser`: an under-barrel laser module is fitted.
         */
        function drawWeapon(ctx, type, x, y, angle, scale = 1.0, laser = false) {
            const M = weaponModel(type), sp = bakeWeapon(M, laser);
            ctx.save();
            ctx.translate(x, y);
            if (angle) ctx.rotate(angle);
            if (scale !== 1) ctx.scale(scale, scale);
            ctx.drawImage(sp.cv, sp.x, sp.y, sp.w, sp.h);
            if (M.glow.length && _zoomLOD < 2) {
                // The lights breathe slowly (~3.6 s), each a beat behind the one before, so a soft wave
                // travels down the gun; a spark glides along its light line every few seconds.
                const a0 = ctx.globalAlpha, t = _frameTime / 1000;
                ctx.globalCompositeOperation = 'lighter';
                M.glow.forEach((g, i) => {
                    const br = 0.5 + 0.5 * Math.sin(t * 1.75 - i * 0.7);
                    ctx.globalAlpha = a0 * (0.22 + 0.5 * br);
                    drawGlow(ctx, g[0], g[1], g[2] * (0.85 + 0.25 * br), g[3], 0.2);
                });
                if (M.run && _zoomLOD === 0) {
                    const u = (t / 3.2) % 1, k = Math.sin(Math.min(1, u / 0.7) * Math.PI);   // glides for 70% of the cycle, then rests
                    if (u < 0.7) {
                        ctx.globalAlpha = a0 * 0.9 * k;
                        drawGlow(ctx, M.run[0] + (M.run[1] - M.run[0]) * (u / 0.7), M.run[2], 1.8, M.run[3], 0.35);
                    }
                }
                ctx.globalAlpha = a0;
            }
            ctx.restore();
        }
        
