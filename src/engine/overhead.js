        // ═══ OVERHEAD — tall things that stand over the people ═══
        // The scene draws in layers (floor, props, people, the player, then roofs), so on their own a tall shelf or
        // a sign hung from the ceiling would sit under everyone. Anything taller than a person goes here instead:
        // its draw is queued during the frame (Overhead.add) and run farthest from the camera first, so nearer tall
        // things cover farther ones. One that stands between the camera and someone (they're farther out, under its
        // lean) draws after the people (Overhead.flush) and hides them; the rest draw before them (drawUnder), so
        // whoever stands in front of a shelf shows over its foot; with someone right beside it, it's drawn once more
        // after them over its own footprint only, so an arm or a glass that reaches into the shelf goes behind it.
        // Both are called from draw.js.
        //   · a prop: give it `tall: true` (map-entities.js) and the props pass hands its draw here
        //   · bespoke art (interiors.js): Overhead.add({ x, y, w, h }, ctx => …) from the floor hook
        //   · above every head (hanging signs, chandeliers): Overhead.add(rect, draw, { above: true }), always after
        // The roof pass sorts buildings the same way (draw.js _depthSortTops).

        const OVERHEAD = {
            REACH: 14,                  // world px past a person's feet their body reaches (what a tall thing can hide)
            ARMS: 30,                   // ...and their arms and what they hold (into a shelf beside them)
        };

        const Overhead = {
            items: [],
            _people: [],

            /** Queue a tall thing for this frame: its footprint (x, y, w, h) and its draw(ctx). opts.hull: the outline
                it covers on screen (world points), if it leans past its footprint (leanHull). */
            add(rect, draw, opts) {
                const w = rect.w ?? rect.width ?? 0, h = rect.h ?? rect.height ?? 0;
                this.items.push({ x: rect.x, y: rect.y, w, h, draw, above: !!(opts && opts.above), hull: (opts && opts.hull) || null, d: 0 });
            },

            /** The outline of a box (x, y, w, h) leaning away from (cx, cy): its foot and its top, k times as far out. */
            leanHull(x, y, w, h, cx, cy, k) {
                const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
                for (let i = 0; i < 4; i++) pts.push([cx + (pts[i][0] - cx) * k, cy + (pts[i][1] - cy) * k]);
                pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
                const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
                const lo = [], hi = [];
                for (const p of pts) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
                for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
                lo.pop(); hi.pop();
                return lo.concat(hi);
            },

            /** Squared distance from (cx, cy) to a footprint (0 inside it). */
            _dist(r, cx, cy) {
                const dx = Math.max(r.x - cx, 0, cx - (r.x + r.w)), dy = Math.max(r.y - cy, 0, cy - (r.y + r.h));
                return dx * dx + dy * dy;
            },

            /** Whoever's in view (the player, people, enemies, the crew). */
            _gather(game, cx, cy) {
                const people = this._people; people.length = 0;
                const V = game.view || game.camera, z = V.zoom || 1, hw = game.canvas.width / 2 / z + 60, hh = game.canvas.height / 2 / z + 60;
                const take = c => { if (c && c.visible !== false && !c.dead && Math.abs(c.x - cx) < hw && Math.abs(c.y - cy) < hh) people.push(c); };
                take(game.player);
                for (const n of game.npcs || []) take(n);
                for (const e of game.enemies || []) take(e);
                for (const t of game.teammates || []) take(t);
                return people;
            },

            /** Does it stand between the camera and anyone (someone farther out than it, under what it covers)? */
            _hides(it, people, cx, cy) {
                let x0 = it.x, y0 = it.y, x1 = it.x + it.w, y1 = it.y + it.h;
                if (it.hull) for (const [x, y] of it.hull) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
                for (const c of people) {
                    const r = OVERHEAD.REACH + (c.radius || 0);
                    if (c.x < x0 - r || c.x > x1 + r || c.y < y0 - r || c.y > y1 + r) continue;
                    if ((c.x - cx) ** 2 + (c.y - cy) ** 2 > it.d) return true;
                }
                return false;
            },

            /** Is anyone close enough that their arms, or what they hold, could reach into its footprint? */
            _touches(it, people) {
                for (const c of people) {
                    const r = OVERHEAD.ARMS + (c.radius || 0);
                    if (c.x > it.x - r && c.x < it.x + it.w + r && c.y > it.y - r && c.y < it.y + it.h + r) return true;
                }
                return false;
            },

            /** After the props, before the people: what hides no one draws now, under them (farthest first), so
                whoever stands in front of it shows over its foot. The rest waits for flush. */
            drawUnder(ctx, game) {
                const items = this.items;
                if (!items.length) return;
                const V = game.view || game.camera, cx = V.x, cy = V.y, people = this._gather(game, cx, cy);
                for (const it of items) it.d = it.above ? -1 : this._dist(it, cx, cy);
                items.sort((a, b) => b.d - a.d);
                let keep = 0;
                for (const it of items) {
                    if (it.above || this._hides(it, people, cx, cy)) { items[keep++] = it; continue; }
                    ctx.save(); it.draw(ctx); ctx.restore();
                    // someone right beside it: their arms or what they hold may reach into it; flush draws it again
                    // over them, but only over its footprint (inside the shelf), so what's in front of it still shows
                    if (this._touches(it, people)) { it.cap = true; items[keep++] = it; }
                }
                items.length = keep;
            },

            /** After the people: the rest, farthest first, over them; then forget it. */
            flush(ctx, game) {
                const items = this.items;
                if (!items.length) return;
                // The rooms she isn't in wear a violet veil, laid before the player (rooms.js drawVeil); what's drawn
                // here comes after it, so it's veiled again where it stands
                const veil = game.roomSystem && game.roomSystem.active && game.getAmbientDarkness() < 0.5;
                let veilPath = null;
                for (const it of items) {
                    ctx.save();
                    if (it.cap) { ctx.beginPath(); ctx.rect(it.x, it.y, it.w, it.h); ctx.clip(); }
                    it.draw(ctx); ctx.restore();
                    if (veil && !it.above) {
                        veilPath = veilPath || new Path2D();
                        if (it.cap) veilPath.rect(it.x, it.y, it.w, it.h);
                        else if (it.hull) { veilPath.moveTo(it.hull[0][0], it.hull[0][1]); for (let i = 1; i < it.hull.length; i++) veilPath.lineTo(it.hull[i][0], it.hull[i][1]); veilPath.closePath(); }
                        else veilPath.rect(it.x, it.y, it.w, it.h);
                    }
                }
                if (veilPath) { ctx.save(); ctx.clip(veilPath); game.roomSystem.drawVeil(ctx); ctx.restore(); }
                items.length = 0;
            },

            /** A map change: drop anything queued. */
            clear() { this.items.length = 0; }
        };
