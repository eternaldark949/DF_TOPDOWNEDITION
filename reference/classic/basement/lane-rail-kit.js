        // ===== LV0 BASEMENT =====
        // The rail kit: things that run along a fixed line (a lane, a curve through a junction), knowing nothing about any
        // game. A RAIL is anything with a length and a shape; the kit samples a curved one into a table once, so a runner
        // reads its position, heading and bend from s (distance along) without solving the curve every tick.
        //
        // TABLE     { length, n, s: Float64Array, x, y, a (heading), k (signed curvature: + bends toward +angle) }
        //
        // railKit.table(getPoint(t), getAngle(t), n) -> TABLE         sample a curve t = 0..1 by arc length
        // railKit.at(table, s, out) -> out { x, y, a, k }             where s along it is (clamped to its ends)
        // railKit.throttle(v, target, brake, urgency) -> gas -1..1   the pedal a driver gives to reach a speed
        // railKit.roll(v, gas, accel, brake, top, revBelow) -> v     one tick of speed along the line (drag solved from top)
        // railKit.followCap(gap, v, vLead, brake, leadBrake, minGap) -> the fastest speed that can still stop behind a leader
        const railKit = {
            table(getPoint, getAngle, n = 24) {
                const s = new Float64Array(n + 1), x = new Float64Array(n + 1), y = new Float64Array(n + 1);
                const a = new Float64Array(n + 1), k = new Float64Array(n + 1);
                let len = 0;
                for (let i = 0; i <= n; i++) {
                    const p = getPoint(i / n);
                    x[i] = p.x; y[i] = p.y; a[i] = getAngle(i / n);
                    if (i) len += Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
                    s[i] = len;
                }
                for (let i = 0; i <= n; i++) {
                    const i0 = Math.max(0, i - 1), i1 = Math.min(n, i + 1), ds = s[i1] - s[i0];
                    const da = Math.atan2(Math.sin(a[i1] - a[i0]), Math.cos(a[i1] - a[i0]));
                    k[i] = ds > 1e-6 ? da / ds : 0;
                }
                return { length: len, n, s, x, y, a, k };
            },

            at(T, s, out) {
                const n = T.n;
                if (!(s > 0)) s = 0; else if (s > T.length) s = T.length;
                let lo = 0, hi = n;
                while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T.s[m] <= s) lo = m; else hi = m; }
                const ds = T.s[hi] - T.s[lo], f = ds > 1e-9 ? (s - T.s[lo]) / ds : 0;
                out.x = T.x[lo] + (T.x[hi] - T.x[lo]) * f;
                out.y = T.y[lo] + (T.y[hi] - T.y[lo]) * f;
                const da = Math.atan2(Math.sin(T.a[hi] - T.a[lo]), Math.cos(T.a[hi] - T.a[lo]));
                out.a = T.a[lo] + da * f;
                out.k = T.k[lo] + (T.k[hi] - T.k[lo]) * f;
                return out;
            },

            throttle(v, target, brake = 0.3, urgency = 0.6) {
                const d = target - v;
                if (v > 0.05 && (d < -0.3 || (target < 0.5 && d < -0.05))) return Math.max(-1, Math.min(-0.12, d / (brake * 2)));
                if (d > 0.5) return Math.min(1, d * 0.5 * (0.5 + urgency));
                if (d < -0.5) return Math.max(-1, d * 0.4 * (0.5 + urgency));
                return d * 0.2;
            },

            roll(v, gas, accel, brake, top, revBelow = 0.25) {
                if (Math.abs(gas) > 0.1) {
                    if (v * gas < 0 && Math.abs(v) > revBelow) {
                        const dec = Math.min(Math.abs(v), Math.abs(gas) * brake);
                        v -= Math.sign(v) * dec;
                    } else v += gas * accel;
                }
                return v * (top / (accel + top));
            },

            followCap(gap, v, vLead, brake, leadBrake, minGap) {
                if (gap < minGap) return 0;
                const b = brake * 0.85, vl = Math.max(0, vLead), room = gap - minGap - v * 4;
                if (room <= 0) return vl * 0.85;
                return Math.sqrt(vl * vl * (b / (leadBrake || 0.3)) + 2 * b * room);
            }
        };
