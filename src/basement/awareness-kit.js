        // ===== LV0 BASEMENT =====
        // The awareness matrix: what one character knows of what's around them, in one place, the same way for
        // everyone (a guard, a passer-by, the crew). The owner keeps one, and asks it instead of measuring by hand.
        // (The terms are from the g7 engine: base game script 2.0's gameCharacter.awarenessMatrix.)
        //
        // It knows nothing about any game: the owner hands it
        //   evaluation_radius   how far it pays attention (a number, or a function: it may change, a buff may dull it)
        //   personal_space      inside this, they can't miss you (default: evaluation_radius × 0.05)
        //   fov                 the sight cone's full width, radians (default: all round)
        //   behind              how far off their facing counts as behind them (radians; default 0.6π)
        //   facing()            which way they face (default: owner.angle)
        //   touch               bodies touching: inside this they feel it, whatever the light or the angle (default 0: never)
        //   sight(x, y, ...ctx) whether the way from them to (x, y) is clear (walls, shut doors); default: always
        //
        // ENTRY (one per thing noticed, by id):  [id, kind, distance, bearing, seen, heard, close, behind, touching]
        //   bearing   world angle from them to it;  seen   null until looked at, then true/false
        //   heard     how loud it was when last heard (0..1, 0 = not heard: hear());  close   inside personal space;  behind   off their back
        //   touching  bumped into them (inside `touch`)
        //   hear(x, y, strength, kind) -> ENTRY  a sound: where it came from and how loud (kept as a 'sound' entry)
        // awarenessMatrix(owner, packet)
        //   observe(thing, kind) -> ENTRY        where it is from them (cheap: no sight line yet)
        //   look(entry, range, ...ctx) -> bool   can they see it: in range, in the cone, the way clear (sets entry.seen)
        //   canSee(x, y, ...ctx)                 the same for a point
        //   analyzeSurroundings(things, kind)    observe each one within evaluation_radius; entries holds them
        //   forwards_point, backwards_point      [x, y] a personal space ahead of and behind them
        //   entries (Map id -> ENTRY), forget(id), clear()
        //   drawDebug(ctx, { px, colour, now, fade, label })   the matrix drawn (the debug view)
        const AWARE = { ID: 0, KIND: 1, DIST: 2, BEARING: 3, SEEN: 4, HEARD: 5, CLOSE: 6, BEHIND: 7, TOUCHING: 8 };

        class awarenessMatrix {
            constructor(owner, { evaluation_radius = 400, personal_space = null, fov = Math.PI * 2, behind = Math.PI * 0.6, touch = 0, sight = null, facing = null } = {}) {
                Object.assign(this, { owner, evaluation_radius, personal_space, fov, behind, touch, sight, facing, heard: null, entries: new Map(), forwards_point: [0, 0], backwards_point: [0, 0] });
            }
            static wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
            get face() { return this.facing ? this.facing() : (this.owner.angle || 0); }
            _val(v) { return typeof v === 'function' ? v() : v; }
            get radius() { return this._val(this.evaluation_radius); }
            get space() { const s = this._val(this.personal_space); return s == null ? this.radius * 0.05 : s; }
            get cone() { return this._val(this.fov); }

            /** Where `thing` is from them: an ENTRY (kept under thing.id, or the thing itself without one). */
            observe(thing, kind = null) {
                const o = this.owner, dx = thing.x - o.x, dy = thing.y - o.y, dist = Math.hypot(dx, dy), bearing = Math.atan2(dy, dx);
                const key = thing.id ?? thing, e = this.entries.get(key) || [key, kind, 0, 0, null, 0, false, false, false];
                e[1] = kind ?? e[1]; e[2] = dist; e[3] = bearing; e[4] = null;
                e[6] = dist < this.space; e[7] = Math.abs(awarenessMatrix.wrap(bearing - this.face)) > this.behind; e[8] = dist < this._val(this.touch);
                e.at = [thing.x, thing.y];   // where it was (the sight line is drawn to it)
                this.entries.set(key, e);
                return e;
            }
            /** Can they see it: within `range` (default: the evaluation radius), inside the cone, the way clear. */
            look(e, range = this.radius, ...ctx) {
                const o = this.owner;
                if (e[2] > range || Math.abs(awarenessMatrix.wrap(e[3] - this.face)) > this.cone / 2) return e[4] = false;
                return e[4] = !this.sight || !!this.sight(e.at[0], e.at[1], ...ctx);
            }
            /** The same for a point (no entry kept). */
            canSee(x, y, ...ctx) {
                const o = this.owner, dist = Math.hypot(x - o.x, y - o.y);
                if (dist > this.radius) return false;
                if (Math.abs(awarenessMatrix.wrap(Math.atan2(y - o.y, x - o.x) - this.face)) > this.cone / 2) return false;
                return !this.sight || !!this.sight(x, y, ...ctx);
            }
            /** Observe every one of `things` within the evaluation radius (the rest are forgotten); the points ahead and behind. */
            analyzeSurroundings(things = [], kind = null) {
                const o = this.owner, r = this.radius, s = this.space, a = this.face, seen = new Set();
                this.forwards_point[0] = o.x + Math.cos(a) * s; this.forwards_point[1] = o.y + Math.sin(a) * s;
                this.backwards_point[0] = o.x - Math.cos(a) * s; this.backwards_point[1] = o.y - Math.sin(a) * s;
                for (const t of things) {
                    if (!t || t === o || (t.x - o.x) ** 2 + (t.y - o.y) ** 2 > r * r) continue;
                    seen.add(this.observe(t, kind)[0]);
                }
                for (const [k, e] of this.entries) if ((kind == null || e[1] === kind) && !seen.has(k)) this.entries.delete(k);
                return this.entries;
            }
            /** A sound at (x, y), `strength` 0..1: kept as the matrix's `heard` entry (the latest), and returned. */
            hear(x, y, strength = 1, kind = 'sound') {
                const e = this.observe({ id: 'sound', x, y }, 'sound'); e[5] = strength; e.kind_of = kind; e.at_time = typeof _gameTimeSec !== 'undefined' ? _gameTimeSec : 0;
                return this.heard = e;
            }
            /** The debug view (ui/dev-overlay.js 'Awareness'): personal space (dashed), the touch ring, the cone out to the
             *  evaluation radius (or `range`), a line to everything noticed (solid: seen; dashed: noticed, not seen), and the last sound
             *  heard (dotted, fading over `fade` s, its strength). `px` is one screen pixel in world units. */
            drawDebug(ctx, { px = 1, colour = '#9fe0ff', now = 0, fade = 3, label = null, range = null } = {}) {
                const o = this.owner, a = this.face, r = range ?? this.radius, s = this.space, cone = this.cone, t = this._val(this.touch);
                ctx.save(); ctx.strokeStyle = colour; ctx.fillStyle = colour; ctx.lineWidth = px;
                ctx.globalAlpha = 0.5; ctx.setLineDash([4 * px, 4 * px]); ctx.beginPath(); ctx.arc(o.x, o.y, s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
                if (t > 0) { ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(o.x, o.y, t, 0, Math.PI * 2); ctx.stroke(); }
                ctx.globalAlpha = 0.25; ctx.beginPath();
                if (cone < Math.PI * 2 - 1e-6) { ctx.moveTo(o.x, o.y); ctx.arc(o.x, o.y, r, a - cone / 2, a + cone / 2); ctx.closePath(); } else ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(o.x + Math.cos(a) * s, o.y + Math.sin(a) * s, 2.5 * px, 0, Math.PI * 2); ctx.fill();   // forwards_point
                for (const e of this.entries.values()) {
                    if (e[1] === 'sound' || !e.at || e[2] > this.radius || (e[4] === null && !e[6])) continue;   // only what's in reach and looked at, or close
                    ctx.globalAlpha = e[4] ? 0.95 : 0.45; ctx.setLineDash(e[4] ? [] : [6 * px, 4 * px]);
                    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(e.at[0], e.at[1]); ctx.stroke(); ctx.setLineDash([]);
                    if (e[8]) { ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(e.at[0], e.at[1], 8 * px, 0, Math.PI * 2); ctx.stroke(); if (label) label('bump', e.at[0], e.at[1] - 12 * px, colour); }
                }
                const h = this.heard, age = h ? now - (h.at_time || 0) : Infinity;
                if (h && age < fade) {
                    ctx.globalAlpha = 0.9 * (1 - age / fade); ctx.setLineDash([2 * px, 3 * px]);
                    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(h.at[0], h.at[1]); ctx.stroke(); ctx.setLineDash([]);
                    if (label) label('heard ' + h[5].toFixed(2), (o.x + h.at[0]) / 2, (o.y + h.at[1]) / 2, colour);
                }
                ctx.restore();
            }
            forget(id) { this.entries.delete(id); }
            clear() { this.entries.clear(); this.heard = null; }
        }
