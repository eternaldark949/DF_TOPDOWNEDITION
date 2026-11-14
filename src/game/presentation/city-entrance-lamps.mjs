import { circle, radial, glow } from '../../engine/basement/rendering/index.mjs';

/**
 * The lamps at a landmark's entrance, as real pieces leaning with the building: a definition's `lamps` (in
 * `city-tiered.mjs`) says which stand there, in the building's own frame (front at +y, as its tiers are authored;
 * facing 'N' turns them round with the plan). They are drawn after its tiers, their glass and halos again in its
 * glow; their light on the street is the city's own lamps (exported with the map).
 *
 * A lamp is `{kind, x, y, z, out, rgb, size, zsize, top, ...}`: x, y on the plan (px), z its height (design units),
 * `out` how far it stands off the wall, `rgb` its glass's light ('r, g, b'); `size` (default `SIZE`) how many times
 * as wide as its numbers it is drawn and `zsize` how many times as tall (a wall lamp 1.5, one on the street 1), about
 * its anchor: its foot on the street (`GROUND` kinds) or its fixing on the wall at z (a hung one: at `top`), so it
 * reads beside a person. The kinds, one a vibe:
 *   lantern    a wrought-iron carriage lantern on a scroll bracket
 *   gooseneck  a steel barn shade on a curved arm (`band`, `shade_hi`, `shade_lo`)
 *   sconce     a slim up-and-down cylinder sconce (`metal`, `metal_hi`)
 *   pylon      a frosted light pylon on the pavement, a lit cap (`glass`, `cap`)
 *   crystal    a cut crystal glowing on a stone plinth
 *   carnival   a brass post with a cluster of globes (`arms`)
 *   bulkhead   a caged bulkhead hung from a canopy's edge (`top`)
 * The classic is `legacy/buildings/entrance-lamps.js`.
 */
export const SIZE = 2.2;
const GROUND = new Set(['pylon', 'crystal', 'carnival']);

/** A lamp's own view of the building: the building's lean, scaled about its anchor. */
function lampView(b, view, s, ax, ay) {
    const m = s.size ?? SIZE, mz = s.zsize ?? (GROUND.has(s.kind) ? 1 : 1.5), az = GROUND.has(s.kind) ? 0 : (s.top ?? s.z), [cx, cy] = view.camera;
    const Z = z => az + (z - az) * mz;
    return {
        m, camera: [ax + (cx - ax) / m, ay + (cy - ay) / m],
        at: (x, y, z) => b.at(view, ax + (x - ax) * m, ay + (y - ay) * m, Z(z)),
        k: z => b.k(view, Z(z)) * m
    };
}

/** The drawing tools in a lamp's view; in the glow pass a halo leaves its strength on what follows, as the classic's did. */
function tools(art, L, lit) {
    let alpha = 1;
    const put = (fn) => { if (lit && alpha < 1) { art.enter({}, { opacity: alpha }); fn(); art.leave(); } else fn(); };
    const path = pts => [...pts.map(([x, y, z], i) => [i ? 'line' : 'move', ...L.at(x, y, z)])];
    return {
        /** A box from (x0, y0) to (x1, y1), z0..z1: the faces turned to the camera, then the cap. */
        prism(x0, y0, x1, y1, z0, z1, wall, cap, shade = true) {
            const [cx, cy] = L.camera, faces = [];
            if (cy > y1) faces.push([x0, y1, x1, y1, 0]); if (cy < y0) faces.push([x1, y0, x0, y0, .3]);
            if (cx > x1) faces.push([x1, y1, x1, y0, .15]); if (cx < x0) faces.push([x0, y0, x0, y1, .15]);
            put(() => {
                for (const [ax, ay, bx, by, s] of faces) {
                    const q = [...path([[ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1]]), ['close']];
                    art.fill(q, wall); if (shade && s) art.fill(q, `rgba(0, 0, 0, ${s})`);
                }
                if (cap) art.fill([...path([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]), ['close']], cap);
            });
        },
        /** A line through points [x, y, z], w px wide at the street, round at its ends. */
        line(pts, w, colour) { put(() => { art.enter({}, { line_cap: 'round' }); art.stroke(path(pts), colour, w * L.k(pts[pts.length - 1][2])); art.leave(); }); },
        /** A disc (r px) lying at height z. */
        disc(x, y, z, r, fill) { const p = L.at(x, y, z); put(() => art.fill([circle(p[0], p[1], r * L.k(z))], fill)); },
        /** A ball (r px) at height z, lit from the upper left. */
        ball(x, y, z, r, inner, outer) {
            const p = L.at(x, y, z), R = r * L.k(z);
            put(() => art.paint([circle(p[0], p[1], R)], { fill: radial([p[0] - R * .35, p[1] - R * .35], R * .1, p, R, [[0, inner], [1, outer]]) }));
        },
        /** A halo at height z. */
        glow(x, y, z, r, rgb, a) { if (a <= .003) return; alpha = Math.min(1, a); const p = L.at(x, y, z); glow(art, p[0], p[1], r * L.k(z) / Math.sqrt(L.m), rgb, 0, { alpha }); },
        at: L.at, k: L.k, camera: L.camera
    };
}

const KINDS = {
    /** Wrought iron: a scroll bracket off the wall, a tapered lantern of amber glass, a little roof and finial. */
    lantern(E, s, x, y, n, lit, g) {
        const z = s.z, ly = y + n * (s.out ?? 6), rgb = s.rgb ?? '255, 190, 110';
        if (lit) {
            E.glow(x, y + n * 2, z - 2, 26, rgb, .35 * g);                                            // the wash on the brick
            E.glow(x, ly, z - 1.5, 13, rgb, .85 * g);
            E.prism(x - 1.6, ly - 1.6, x + 1.6, ly + 1.6, z - 3.4, z + .2, `rgba(255, 214, 150, ${.9 * g})`, null, false);
            return;
        }
        E.line([[x, y, z + 1.2], [x, y + n * (s.out ?? 6) * .6, z + 1.8], [x, ly, z + 1.2]], .9, '#17110c');   // the bracket
        E.line([[x, y, z - 1.5], [x, y + n * 2.5, z - .3], [x, y + n * 3.2, z + 1.4]], .6, '#17110c');           // its scroll
        E.line([[x - 2.2, y, z - 2.5], [x + 2.2, y, z - 2.5]], 1.4, '#1d1610');                                  // the wall plate
        E.prism(x - 2, ly - 2, x + 2, ly + 2, z - 4, z - 3.4, '#1a140e', '#2b2118');                              // the base
        E.prism(x - 1.7, ly - 1.7, x + 1.7, ly + 1.7, z - 3.4, z + .2, '#9a6a32', null);                         // the glass
        E.line([[x - 1.7, ly + 1.7 * n, z - 3.4], [x - 1.7, ly + 1.7 * n, z + .2]], .5, '#17110c');              // the frame's corners
        E.line([[x + 1.7, ly + 1.7 * n, z - 3.4], [x + 1.7, ly + 1.7 * n, z + .2]], .5, '#17110c');
        E.prism(x - 2.3, ly - 2.3, x + 2.3, ly + 2.3, z + .2, z + .9, '#1a140e', '#33271c');                    // the roof
        E.prism(x - 1.1, ly - 1.1, x + 1.1, ly + 1.1, z + .9, z + 1.6, '#1a140e', '#3c2e20');
        E.disc(x, ly, z + 2.1, .7, '#b48a4a');                                                                   // the finial
    },
    /** A barn shade: a steel arm curving out and over, the shade's dome, a bulb under it lighting the wall. */
    gooseneck(E, s, x, y, n, lit, g) {
        const z = s.z, out = s.out ?? 8, hy = y + n * out, rgb = s.rgb ?? '255, 170, 80';
        if (lit) {
            E.glow(x, y + n * 1.5, z - 5, 34, rgb, .4 * g);                                           // the cone on the wall below
            E.glow(x, hy, z - .8, 10, rgb, .9 * g);
            E.disc(x, hy + n * .6, z - .9, 3.4, `rgba(255, 196, 120, ${.55 * g})`);                   // the shade's lit rim, seen past its edge
            return;
        }
        E.line([[x, y, z - 2.5], [x, y + n * 2, z + 1.2], [x, y + n * out * .55, z + 2.4], [x, hy - n * 1.5, z + 1.6], [x, hy, z + .4]], .9, '#2b2d33');
        E.line([[x - 1.8, y, z - 2.5], [x + 1.8, y, z - 2.5]], 1.6, '#16171b');                                  // the wall plate
        E.ball(x, hy, z, 4.2, s.shade_hi ?? '#6a6f78', s.shade_lo ?? '#1d1f24');                                 // the shade's dome
        E.disc(x, hy, z + .6, 1.2, '#2b2d33');                                                                   // its socket
        if (s.band) E.line([[x - 3.6, hy + n * 1.6, z - .4], [x + 3.6, hy + n * 1.6, z - .4]], .5, s.band);      // the enamel band
    },
    /** A slim cylinder on the wall, light out of both ends. */
    sconce(E, s, x, y, n, lit, g) {
        const z = s.z, cy = y + n * (s.out ?? 2.5), rgb = s.rgb ?? '255, 200, 170';
        if (lit) {
            E.glow(x, y + n * .5, z + 5, 18, rgb, .4 * g); E.glow(x, y + n * .5, z - 5, 18, rgb, .4 * g);
            E.glow(x, cy, z + 2.6, 6, rgb, .9 * g); E.glow(x, cy, z - 2.6, 6, rgb, .7 * g);
            return;
        }
        E.line([[x, y, z], [x, cy, z]], 1.2, '#2a2a30');
        E.prism(x - 1.5, cy - 1.5, x + 1.5, cy + 1.5, z - 2.6, z + 2.6, s.metal ?? '#b88a76', s.metal_hi ?? '#f4c4ae');
        E.disc(x, cy, z + 2.65, .9, '#3a2c28');
    },
    /** A frosted pylon on the pavement: a dark foot, a tall glass body with a lit seam, a cap that glows. */
    pylon(E, s, x, y, n, lit, g) {
        const z = s.z, rgb = s.rgb ?? '120, 255, 240', w = 2.2;
        if (lit) {
            E.glow(x, y, 2, 30, rgb, .35 * g);                                                        // its pool round the foot
            E.prism(x - w + .5, y - w + .5, x + w - .5, y + w - .5, 2, z - 1, `rgba(${rgb}, ${.45 * g})`, null, false);
            E.glow(x, y, z - .5, 12, rgb, .9 * g);
            E.disc(x, y, z + .05, w * .7, `rgba(${rgb}, ${.9 * g})`);
            E.line([[x - w + .4, y + n * w, 2.2], [x - w + .4, y + n * w, z - 1.2]], .6, `rgba(220, 255, 255, ${.9 * g})`);
            return;
        }
        E.prism(x - w - .6, y - w - .6, x + w + .6, y + w + .6, 0, 2, '#0b1616', '#142424');
        E.prism(x - w, y - w, x + w, y + w, 2, z - 1, s.glass ?? '#5f8a88', null);
        E.line([[x - w + .4, y + n * w, 2.2], [x - w + .4, y + n * w, z - 1.2]], .6, '#9fe8e0');               // the seam
        E.prism(x - w - .4, y - w - .4, x + w + .4, y + w + .4, z - 1, z, '#0b1616', '#0f1e1e');
        E.disc(x, y, z + .05, w * .7, s.cap ?? '#86b0ad');                                                       // the lens in its cap
    },
    /** A cut crystal on a stone plinth: a six-sided point, its facets shaded round, light in its heart. */
    crystal(E, s, x, y, n, lit, g, art) {
        const z = s.z, rgb = s.rgb ?? '150, 200, 255', z0 = 6.5, R = 3.6, [cx, cy] = E.camera;
        if (lit) {
            E.glow(x, y, z0 + 1, 34, rgb, .3 * g);
            E.glow(x, y, (z0 + z) / 2, 14, rgb, .8 * g);
            E.glow(x, y, z, 6, '235, 245, 255', .9 * g);
            return;
        }
        E.prism(x - 3.8, y - 3.8, x + 3.8, y + 3.8, 0, 1.5, '#3a4656', '#526275');                                // the step
        E.prism(x - 3, y - 3, x + 3, y + 3, 1.5, z0, '#14243c', '#1d2f4a');                                        // the plinth
        E.line([[x - 3, y + 3 * n, z0 - 1], [x + 3, y + 3 * n, z0 - 1]], .5, '#c1a980');                           // its gold band
        // the facets: from the ring's foot (just above the plinth) to the point, the far ones first
        const ring = Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3 + Math.PI / 6; return [x + Math.cos(a) * R, y + Math.sin(a) * R * .8]; });
        const foot = E.at(x, y, z0 + .4), tip = E.at(x, y, z), mid = z0 + (z - z0) * .32, cols = ['#2c5f99', '#4b80bb', '#1c3f6c', '#0f2547', '#3a6aa4', '#6d9cd0'];
        const facets = ring.map((p, i) => { const q = ring[(i + 1) % 6]; return { i, p, q, d: -Math.hypot((p[0] + q[0]) / 2 - cx, (p[1] + q[1]) / 2 - cy) }; }).sort((a, c) => a.d - c.d);
        for (const f of facets) {
            const a = E.at(f.p[0], f.p[1], mid), c = E.at(f.q[0], f.q[1], mid);
            art.paint([['move', ...foot], ['line', ...a], ['line', ...tip], ['line', ...c], ['close']], { fill: cols[f.i], stroke: 'rgba(190, 216, 238, 0.55)', stroke_width: .4 * E.k(mid) });
        }
    },
    /** A brass post, a ring of arms with a globe on each and one on top, a striped finial over that. */
    carnival(E, s, x, y, n, lit, g) {
        const z = s.z, rgb = s.rgb ?? '255, 214, 150', arms = s.arms ?? 2, aw = 4.6;
        const globes = [[x, y, z + 1.6]]; if (arms >= 2) globes.push([x - aw, y, z - 1], [x + aw, y, z - 1]);
        if (lit) {
            E.glow(x, y, z - 2, 40, rgb, .3 * g);
            for (const [gx, gy, gz] of globes) { E.glow(gx, gy, gz, 9, rgb, .85 * g); E.ball(gx, gy, gz, 1.9, `rgba(255, 250, 230, ${g})`, `rgba(255, 190, 110, ${.5 * g})`); }
            return;
        }
        E.prism(x - 2.4, y - 2.4, x + 2.4, y + 2.4, 0, 1.6, '#3a1820', '#692735');                                // the plinth
        E.line([[x, y, 1.6], [x, y, z]], 1.4, '#9a7444');                                                          // the post
        E.line([[x, y, z * .35], [x, y, z * .35 + .4]], 2.4, '#d4b07a');                                           // its collars
        E.line([[x, y, z * .7], [x, y, z * .7 + .4]], 2.2, '#d4b07a');
        if (arms >= 2) E.line([[x - aw, y, z - 2.2], [x - aw * .5, y, z - .4], [x, y, z - .6], [x + aw * .5, y, z - .4], [x + aw, y, z - 2.2]], .8, '#bc945b');
        for (const [gx, gy, gz] of globes) E.ball(gx, gy, gz, 1.9, '#f6ead0', '#a88d6a');
        E.disc(x, y, z + 3.8, 1.2, '#e5a29a'); E.disc(x, y, z + 4.3, .7, '#ead8b1');                              // the finial
    },
    /** Hung from a canopy's edge on a rod: a cast box with a wire cage over sodium glass. */
    bulkhead(E, s, x, y, n, lit, g) {
        const z = s.z, rgb = s.rgb ?? '255, 200, 110', top = s.top ?? z + 3;
        if (lit) {
            E.glow(x, y, z - 2, 44, rgb, .35 * g);
            E.glow(x, y, z - 1, 10, rgb, .9 * g);
            E.prism(x - 2.6, y - 1.6, x + 2.6, y + 1.6, z - 1.8, z - .4, `rgba(255, 210, 130, ${.85 * g})`, null, false);
            return;
        }
        E.line([[x, y, top], [x, y, z]], .7, '#1b1c20');                                                          // the rod
        E.prism(x - 3, y - 2, x + 3, y + 2, z - .4, z + .4, '#2c2e33', '#4a4c52');                                // the housing
        E.prism(x - 2.6, y - 1.6, x + 2.6, y + 1.6, z - 1.8, z - .4, '#a7864a', null);                            // the glass
        for (const dx of [-1.3, 0, 1.3]) E.line([[x + dx, y + 1.6 * n, z - 1.8], [x + dx, y + 1.6 * n, z - .4]], .35, '#1b1c20');   // the cage
        E.line([[x - 2.6, y + 1.6 * n, z - 1.1], [x + 2.6, y + 1.6 * n, z - 1.1]], .35, '#1b1c20');
    }
};

/** Where a lamp stands in the world. */
export function lampAt(b, s) { const [x, y] = b.local(s.x, s.y); return [b.x + x, b.y + y]; }

/** A building's entrance lamps into `art`: by day their pieces; `lit`, their glass and halos at strength g (in an additive group). */
export function entranceLamps(art, b, view, lamps, lit, g = 1) {
    const n = b.facing === 'N' ? -1 : 1;
    for (const s of lamps) {
        const kind = KINDS[s.kind]; if (!kind) throw new TypeError(`Unknown entrance lamp: ${s.kind}`);
        const [x, y] = lampAt(b, s);
        kind(tools(art, lampView(b, view, s, x, y), lit), s, x, y, n, lit, g, art);
    }
}
