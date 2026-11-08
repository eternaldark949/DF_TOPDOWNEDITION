        // ===== LV0 BASEMENT =====
        // The collision kit: the parts of a collision step that know nothing about any game. The shape tests are the
        // shape kit's (basement/shape-kit.js), the broad phase the spatial grid's (basement/spatial-grid.js).
        //
        // BODY      a circle: { x, y, radius }, and where it was last tick (px, py; default: where it is)
        // BOX       a moving box: { x, y, angle, length (along angle), width }, and where it was last tick (px, py)
        // CONTACT   { nx, ny, depth, x, y, swept }   the way out (unit normal, world), how far in, where the body goes
        //           (just outside the box), and whether it was found only along the tick's path (the box went through it)
        //
        // collisionKit.circleVsMovingBox(body, box) -> CONTACT | null
        //   touching now, or crossed this tick (a fast box passing a small body between two ticks: the sweep, in the
        //   box's frame, of the body's path against the box's rounded outline), so nothing slips through a car
        const collisionKit = {
            circleVsMovingBox(c, b) {
                const r = c.radius || 0, hl = (b.length || 0) / 2, hw = (b.width || 0) / 2, a = b.angle || 0;
                const cos = Math.cos(-a), sin = Math.sin(-a), cb = Math.cos(a), sb = Math.sin(a);
                const local = (x, y, ox, oy) => { const dx = x - ox, dy = y - oy; return [dx * cos - dy * sin, dx * sin + dy * cos]; };
                const world = (lx, ly) => [b.x + lx * cb - ly * sb, b.y + lx * sb + ly * cb];
                const [lx, ly] = local(c.x, c.y, b.x, b.y);
                // touching now: out along the nearest way (the closest point, or the nearest side when the centre is inside)
                const ex = lx - Math.max(-hl, Math.min(hl, lx)), ey = ly - Math.max(-hw, Math.min(hw, ly)), d2 = ex * ex + ey * ey;
                if (d2 < r * r) {
                    let nlx, nly, tx, ty;
                    if (d2 > 0) { const d = Math.sqrt(d2); nlx = ex / d; nly = ey / d; tx = lx + nlx * (r - d); ty = ly + nly * (r - d); }
                    else if (hl - Math.abs(lx) < hw - Math.abs(ly)) { nlx = Math.sign(lx) || 1; nly = 0; tx = nlx * (hl + r); ty = ly; }
                    else { nlx = 0; nly = Math.sign(ly) || 1; tx = lx; ty = nly * (hw + r); }
                    const [x, y] = world(tx, ty);
                    return { nx: nlx * cb - nly * sb, ny: nlx * sb + nly * cb, depth: Math.hypot(tx - lx, ty - ly), x, y, swept: false };
                }
                // crossed this tick: the body's path in the box's frame (from where each of them was)
                const [ax, ay] = local(c.px ?? c.x, c.py ?? c.y, b.px ?? b.x, b.py ?? b.y);
                if (ax === lx && ay === ly) return null;
                const t = shapeKit.sweepRoundedBox(ax, ay, lx, ly, hl, hw, r);
                if (t === null) return null;
                // thrown clear to the side it was met from (where it stood, across the box's path)
                const side = Math.abs(ay) - hw >= Math.abs(ax) - hl;
                const nlx = side ? 0 : (Math.sign(ax) || 1), nly = side ? (Math.sign(ay) || 1) : 0;
                const tx = side ? Math.max(-hl, Math.min(hl, lx)) : nlx * (hl + r), ty = side ? nly * (hw + r) : Math.max(-hw, Math.min(hw, ly));
                const [x, y] = world(tx, ty);
                return { nx: nlx * cb - nly * sb, ny: nlx * sb + nly * cb, depth: Math.hypot(tx - lx, ty - ly), x, y, swept: true };
            },
        };
