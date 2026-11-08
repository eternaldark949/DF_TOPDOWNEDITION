        // ===== LV3 PENTHOUSE =====
        // THE WEBGL HUMANOID (trial; not in the game build yet): people drawn on the GPU, with no Canvas 2D.
        // The skeleton comes from proceduralHumanoid.skeleton() (the same gait, poses, hands and settling as the
        // Canvas body); this renderer turns it into soft shapes and draws the whole crowd in ONE call.
        //
        // SHAPE PACKET (one instance, 16 floats):
        //   [ax, ay, bx, by,   ra, rb, kind, sheen,   r, g, b, a,   soft, order, 0, 0]
        //   kind 0  tapered capsule from a (radius ra) to b (radius rb): limbs, a ponytail
        //   kind 1  ellipse centred on a, half-axis vector b, other half-axis ra: torso, feet, head, hair
        //   kind 2  soft shadow ellipse (as kind 1, edge `soft` px wide)
        //   kind 3  fan triangle: centre a, rim b → (ra, rb); only the rim is anti-aliased
        //   kind 4  half ring: an ellipse's outline on a (half-axis vector b, other half-axis ra), rb thick, the half ahead of b's way
        //   sheen   how much a highlight it takes (the material kit's rule)
        //   (slot 14: the surface, set by this.tex: 0 cloth or skin, 1 hair fibres, 2 coils)
        // STYLE: 'painterly' (default) keeps the Canvas bodies' look: two soft tone bands, a brush grain
        // along each stroke, hair fibres or coils, and an ink edge. 'lit' shades them as rounded solids.
        // Each shape is lit as a rounded solid: its depth comes from the distance to its edge, so a light
        // from the upper left shades every limb, head and torso the same way.
        //
        //   const R = new glHumanoidRenderer(canvas);
        //   R.begin(camX, camY, zoom); for (const p of people) R.addBody(p, look); R.flush();
        class glHumanoidRenderer {
            static FLOATS = 16;

            constructor(canvas) {
                const gl = this.gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: true, alpha: true });
                if (!gl) throw new Error('WebGL2 is not available');
                this.canvas = canvas; this.count = 0; this.capacity = 0; this.data = null;
                this.cam = [0, 0, 1];
                this.style = 'painterly';                                   // 'painterly' (like the Canvas bodies) or 'lit' (rounded solids)
                this.tex = 0;                                                // surface of the next shapes: 0 cloth or skin, 1 hair fibres, 2 coils, 3 a plain stitch
                this.lower_only = false;                                     // draw only the legs and hips (to see a skirt from above)
                this._outlines = new WeakMap(); this._h = null;
                this.outline_segs = 4;                                       // spline samples between outline points (the Canvas body's 4; 2 halves the triangles)
                this.program = this._program(glHumanoidRenderer.VERT, glHumanoidRenderer.FRAG);
                this.u_view = gl.getUniformLocation(this.program, 'u_view');
                this.u_light = gl.getUniformLocation(this.program, 'u_light');
                this.u_size = gl.getUniformLocation(this.program, 'u_size');
                this.u_style = gl.getUniformLocation(this.program, 'u_style');
                this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
                this.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
                for (let i = 0; i < 4; i++) {                               // four vec4 per instance
                    gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 64, i * 16); gl.vertexAttribDivisor(i, 1);
                }
                this._grow(1024);
                this.colors = new Map();                                     // '#rrggbb' → [r, g, b]
            }

            _program(vs, fs) {
                const gl = this.gl, p = gl.createProgram();
                for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
                    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
                    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
                    gl.attachShader(p, sh);
                }
                gl.linkProgram(p);
                if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
                return p;
            }

            _grow(n) {
                const old = this.data; this.capacity = n; this.data = new Float32Array(n * glHumanoidRenderer.FLOATS);
                if (old) this.data.set(old);
            }

            /** A colour as [r, g, b] 0..1: '#rgb', '#rrggbb' or 'rgb(r, g, b)' (what darkenHex gives). Cached. */
            rgb(col) {
                let c = this.colors.get(col);
                if (!c) {
                    const str = String(col || '#888888'), m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(str);
                    if (m) c = [m[1] / 255, m[2] / 255, m[3] / 255];
                    else {
                        let h = str.replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
                        const n = parseInt(h.padEnd(6, '0').slice(0, 6), 16) || 0;
                        c = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
                    }
                    this.colors.set(col, c);
                }
                return c;
            }

            /** A new frame: the camera's centre in the world and its zoom (pixels per world unit). */
            begin(camX, camY, zoom) { this.count = 0; this.cam[0] = camX; this.cam[1] = camY; this.cam[2] = zoom; }

            /** One shape packet, already in world coordinates. */
            shape(ax, ay, bx, by, ra, rb, kind, sheen, rgb, a, soft = 0) {
                if (this.count === this.capacity) this._grow(this.capacity * 2);
                const d = this.data, o = this.count++ * glHumanoidRenderer.FLOATS;
                d[o] = ax; d[o + 1] = ay; d[o + 2] = bx; d[o + 3] = by;
                d[o + 4] = ra; d[o + 5] = rb; d[o + 6] = kind; d[o + 7] = sheen;
                d[o + 8] = rgb[0]; d[o + 9] = rgb[1]; d[o + 10] = rgb[2]; d[o + 11] = a;
                d[o + 12] = soft; d[o + 13] = this.count; d[o + 14] = this.tex; d[o + 15] = 0;
            }

            /** g.darken(hex, k) as [r, g, b], kept per person (it changes only with their skin or the rain's wet). */
            tone(g, hex, k) {
                const h = this._h;
                if (h._tone_skin !== h.skin || h._tone_wet !== h.wet) { h._tones = new Map(); h._tone_skin = h.skin; h._tone_wet = h.wet; }
                let m = h._tones.get(hex); if (!m) h._tones.set(hex, m = new Map());
                let v = m.get(k); if (!v) m.set(k, v = this.rgb(g.darken(hex, k)));
                return v;
            }

            /** An outline's spline points, made once for each body shape (bodyCanon's bodies are shared and fixed). */
            outline(B, which, band = 0, inflate = 0, segs = this.outline_segs) {
                const m = this._outlines.get(B) || (this._outlines.set(B, new Map()), this._outlines.get(B)), key = which + band + '|' + inflate + '|' + segs;
                let v = m.get(key);
                if (!v) m.set(key, v = bodySplinePoints(which === 'hip' ? bodyHipOutline(B) : bodyTorsoOutline(B, band), inflate, segs));
                return v;
            }

            /** A filled outline (world points), as a fan of triangles from its centre: only the rim is anti-aliased. */
            polygon(pts, rgb, sheen, a) {
                let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
                for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; this.shape(cx, cy, p[0], p[1], q[0], q[1], 3, sheen, rgb, a); }
            }

            /** A person: pose the skeleton (no drawing), then lay down their shapes back to front. */
            addBody(entity, config) {
                const h = this._h = proceduralHumanoid.of(entity).skeleton(entity, config), BC = h.body, g = h.geometry, C = h.clothes;
                const ex = entity.x, ey = entity.y, ang = entity.angle || 0, ca = Math.cos(ang), sa = Math.sin(ang), alpha = entity.life ?? 1;
                // body frame (x forward, y right) → world
                const wx = (x, y) => ex + x * ca - y * sa, wy = (x, y) => ey + x * sa + y * ca;
                const capsule = (x1, y1, x2, y2, r1, r2, rgb, sheen) => this.shape(wx(x1, y1), wy(x1, y1), wx(x2, y2), wy(x2, y2), r1, r2, 0, sheen, rgb, alpha);
                const ellipse = (cx, cy, axx, axy, rb, rgb, sheen, kind = 1, a = alpha, soft = 0) =>
                    this.shape(wx(cx, cy), wy(cx, cy), axx * ca - axy * sa, axx * sa + axy * ca, rb, 0, kind, sheen, rgb, a, soft);
                // A frame inside the body (the hips', the torso's: offset forward by ox, turned by rot), for garments
                // (one affine: frame → body → world, x' = X + x·m0 − y·m1, y' = Y + x·m1 + y·m0)
                const frame = (ox, rot) => {
                    const c = Math.cos(rot), s = Math.sin(rot), m0 = c * ca - s * sa, m1 = c * sa + s * ca, X = ex + ox * ca, Y = ey + ox * sa;
                    const tx = (x, y) => X + x * m0 - y * m1, ty = (x, y) => Y + x * m1 + y * m0, R = this;
                    return {
                        capsule: (x1, y1, x2, y2, r1, r2, rgb, sh) => R.shape(tx(x1, y1), ty(x1, y1), tx(x2, y2), ty(x2, y2), r1, r2, 0, sh, rgb, alpha),
                        ellipse: (cx, cy, axx, axy, rb, rgb, sh, a = 1) => R.shape(tx(cx, cy), ty(cx, cy), axx * m0 - axy * m1, axx * m1 + axy * m0, rb, 0, 1, sh, rgb, alpha * a),
                        ring: (cx, cy, axx, axy, rb, thick, rgb) => R.shape(tx(cx, cy), ty(cx, cy), axx * m0 - axy * m1, axx * m1 + axy * m0, rb, thick, 4, 0, rgb, alpha, thick),
                        tri: (x1, y1, x2, y2, x3, y3, rgb, sh) => R.shape(tx(x1, y1), ty(x1, y1), tx(x2, y2), ty(x2, y2), tx(x3, y3), ty(x3, y3), 3, sh, rgb, alpha),
                        polygon: (pts, rgb, sh, a = 1) => {
                            let cx = 0, cy = 0; const n = pts.length; for (let i = 0; i < n; i++) { cx += pts[i][0]; cy += pts[i][1]; } cx /= n; cy /= n;
                            const Cx = tx(cx, cy), Cy = ty(cx, cy); let px = tx(pts[n - 1][0], pts[n - 1][1]), py = ty(pts[n - 1][0], pts[n - 1][1]);
                            for (let i = 0; i < n; i++) { const qx = tx(pts[i][0], pts[i][1]), qy = ty(pts[i][0], pts[i][1]); R.shape(Cx, Cy, px, py, qx, qy, 3, sh, rgb, alpha * a); px = qx; py = qy; }
                        },
                    };
                };
                const dataOf = (item) => item && typeof GARMENTS !== 'undefined' ? GARMENTS[item.type] : null;
                const F = (item) => (typeof materialKit !== 'undefined' && item ? materialKit.finishOf(item).sheen || 0 : 0);
                const skin = this.rgb(h.skin), top = C.top ? this.rgb(C.top.color) : skin, bottom = C.bottom ? this.rgb(C.bottom.under || C.bottom.color) : skin;
                const botPiece = h.bottom_piece, legs = botPiece && botPiece.legs === 'bare' ? skin : bottom;
                const shoe = this.rgb(C.shoes ? h.darken(C.shoes.color, 0.35) : '#1a1a1a'), hair = C.hair && C.hair.color ? this.rgb(C.hair.color) : null;
                const topSheen = F(C.top), botSheen = F(C.bottom), sleeve = h.sleeve, sleeveRgb = h.sleeve_color ? this.rgb(h.sleeve_color) : top;
                // The same tones the Canvas body uses for each part (procedural-humanoid.js drawArms, drawLegs, drawTorso)
                const D = (hex, k) => this.tone(g, hex, k), sc = h.sleeve_color;
                const upperRgb = sleeve && sleeve !== 'none' ? D(sc, 0.15) : D(h.skin, 0.15), foreRgb = sleeve === 'long' ? D(sc, 0.3) : D(h.skin, 0.3);
                const capRgb = sleeve && sleeve !== 'none' ? D(sc, 0.12) : D(h.skin, 0.12), handRgb = D(h.skin, 0.4);
                const legFull = botPiece && botPiece.legs === 'full', legTone = legFull ? D(C.bottom.under || C.bottom.color, botPiece.shade || 0.45) : (legs === skin ? D(h.skin, 0.15) : legs);
                const thighTone = legs !== skin ? (C.bottom ? D(C.bottom.under || C.bottom.color, 0.35) : legs) : D(h.skin, 0.05);

                ellipse(-2, 0, 13, 0, 11, this.SHADOW, 0, 2, 0.32 * alpha, 5);   // contact shadow
                // Legs: thigh and calf each side, then the feet
                for (let i = 0; i < 2; i++) {
                    const [hx, hy] = g.hipPt[i], [kx, ky] = g.knees[i], [fx, fy] = g.feet[i];
                    capsule(fx, fy, kx, ky, BC.calf[3], BC.calf[1], legTone, legs === skin ? 0 : botSheen);
                    capsule(kx, ky, hx, hy, BC.calf[1], BC.thigh[0], thighTone, legs === skin ? 0 : botSheen);
                    if (!dataOf(C.shoes)) ellipse(fx + 2.6, fy, 4.2 * BC.foot, 0, 2.4 * BC.foot, shoe, 0.4);
                }
                if (dataOf(C.shoes)) garmentKit.gl(this, g, dataOf(C.shoes), C.shoes, frame(0, 0), 0);
                // Hips, in the hips' own frame (as the wardrobe draws them): a garment written as data
                // (penthouse/garment-kit.js) when the bottom has one, else the hip shape in its colour
                {
                    const put = frame(h.hip_anchor_x, h.hip_rotation), data = dataOf(C.bottom);
                    if (data) garmentKit.gl(this, g, data, C.bottom, put, botSheen);
                    else put.polygon(this.outline(BC, 'hip'), bottom, botSheen);
                }
                if (this.lower_only) return;                                 // (a look at the legs and hips alone)
                // Arms: hands, forearms, upper arms (from the shoulders, turned with the torso)
                const torC = Math.cos(h.torso_rotation), torS = Math.sin(h.torso_rotation), sx = h.shoulder_x;
                for (let i = 0; i < 2; i++) {
                    const shY = i ? BC.sh : -BC.sh, shx = sx - shY * torS, shy = shY * torC;
                    const exn = h.elbows[i * 2], eyn = h.elbows[i * 2 + 1], fxn = h.fists[i * 2], fyn = h.fists[i * 2 + 1];
                    ellipse(fxn, fyn, 2.1 * BC.hand, 0, 1.8 * BC.hand, handRgb, 0);
                    capsule(fxn, fyn, exn, eyn, BC.fore[3], BC.fore[0], foreRgb, sleeve === 'long' ? topSheen : 0);
                    capsule(exn, eyn, shx, shy, BC.upper[3], BC.upper[0], upperRgb, sleeve !== 'none' ? topSheen : 0);
                }
                if (C.jewelry) for (const j of C.jewelry) { const d = dataOf(j); if (d) garmentKit.gl(this, g, d, j, frame(0, 0), 0); }
                // Torso: the chest and back, turned with the torso
                const hx = h.hip_anchor_x;
                {
                    const put = frame(hx, h.torso_rotation), data = dataOf(C.top);
                    if (data) garmentKit.gl(this, g, data, C.top, put, topSheen);
                    else put.polygon(this.outline(BC, 'torso'), top, topSheen);
                }
                // Shoulder caps over the arm roots, the sleeve's colour
                for (const sy of [-BC.sh, BC.sh]) ellipse(sx - sy * torS + 0.4, sy * torC, BC.del * 1.06, 0, BC.del * 0.8, capRgb, topSheen);
                // Head and hair: the crown from the Canvas hair's own table (HAIR_CROWNS), long styles hanging behind
                const headX = g.headX, hr = 7.4, crown = hair && typeof HAIR_CROWNS !== 'undefined' ? HAIR_CROWNS[C.hair.type] : null;
                const coil = C.hair && (C.hair.type === 'afro' || C.hair.type === 'curls');
                this.tex = coil ? 2 : 1;
                if (hair && (C.hair.type === 'ponytail' || C.hair.type === 'long' || C.hair.type === 'braids' || C.hair.type === 'dreadlocks'))
                    {
                        const tail = C.hair.type === 'ponytail', sw = tail ? Math.sin(h.walk_cycle || 0) * 2.5 : 0;   // a ponytail swings with the walk
                        if (tail) { capsule(headX - 5, 0, headX - 15, sw * 0.5, 3.0, 2.6, hair, 0.5); capsule(headX - 15, sw * 0.5, headX - 25, sw, 2.6, 1.2, hair, 0.5); }
                        else capsule(headX - 4, 0, headX - 13, 0, 8.5, 6.5, hair, 0.5);
                    }
                { const t = this.tex; this.tex = 0; ellipse(headX + 0.5, 0, hr, 0, hr * 0.92, skin, 0); this.tex = t; }
                if (crown) ellipse(headX + crown[0] - 0.8, 0, crown[1] * 0.92, 0, crown[2] * 0.92, hair, crown[3] === 'coil' ? 0.12 : 0.6);
                this.tex = 0;
                const hat = C.hat && C.hat.color ? C.hat.type : null;          // hats by shape (ui/wardrobe.js hats)
                if (hat === 'wide_brim' || hat === 'cap' || hat === 'beanie' || hat === 'beret' || hat === 'hood_up') {
                    const hc = this.rgb(C.hat.color), hb = this.rgb(C.hat.band || C.hat.color);
                    if (hat === 'wide_brim') { ellipse(headX - 0.5, 0, hr + 3.6, 0, hr + 3.2, hc, 0.3); ellipse(headX - 0.5, 0, hr * 0.85, 0, hr * 0.8, hb, 0.5); }
                    else if (hat === 'cap') { capsule(headX + hr * 0.4, 0, headX + hr + 3, 0, hr * 0.75, hr * 0.6, hc, 0.2); ellipse(headX - 0.6, 0, hr * 0.98, 0, hr * 0.92, hc, 0.35); }
                    else if (hat === 'beanie') { this.tex = 1; ellipse(headX - 0.8, 0, hr * 1.0, 0, hr * 0.95, hc, 0); this.tex = 0; }
                    else if (hat === 'beret') ellipse(headX - 1, 2.2, hr * 0.95, 0, hr * 0.8, hc, 0.1);
                    else ellipse(headX - 2, 0, hr + 2.6, 0, hr + 2, hc, 0.1);   // hood up
                }
            }

            /** Draw everything added since begin() in one instanced call. */
            flush() {
                const gl = this.gl, W = this.canvas.width, H = this.canvas.height, [cx, cy, z] = this.cam;
                gl.viewport(0, 0, W, H);
                gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
                gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                gl.useProgram(this.program); gl.bindVertexArray(this.vao);
                gl.uniform4f(this.u_view, cx, cy, z, 0); gl.uniform3f(this.u_light, -0.45, -0.55, 0.7); gl.uniform2f(this.u_size, W, H); gl.uniform1f(this.u_style, this.style === 'painterly' ? 1 : 0);
                gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
                gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.count * glHumanoidRenderer.FLOATS), gl.DYNAMIC_DRAW);
                gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
                return this.count;
            }
        }
        glHumanoidRenderer.prototype.SHADOW = [0, 0, 0];

        glHumanoidRenderer.VERT = `#version 300 es
        layout(location = 0) in vec4 i_ab;
        layout(location = 1) in vec4 i_shape;
        layout(location = 2) in vec4 i_color;
        layout(location = 3) in vec4 i_extra;
        uniform vec4 u_view;                       // camera x, y, zoom
        uniform vec2 u_size;                       // viewport in pixels
        out vec2 v_p; flat out vec4 v_ab; flat out vec4 v_shape; flat out vec4 v_color; flat out vec4 v_extra;
        void main() {
            int k = gl_VertexID; vec2 corner = vec2((k == 1 || k == 2 || k == 4) ? 1.0 : -1.0, (k == 2 || k == 4 || k == 5) ? 1.0 : -1.0);
            float kind = i_shape.z, pad = 1.5 / u_view.z + i_extra.x;
            vec2 lo, hi;
            if (kind < 0.5) { float r = max(i_shape.x, i_shape.y) + pad; lo = min(i_ab.xy, i_ab.zw) - r; hi = max(i_ab.xy, i_ab.zw) + r; }
            else if (kind > 2.5 && kind < 3.5) { lo = min(min(i_ab.xy, i_ab.zw), i_shape.xy) - pad; hi = max(max(i_ab.xy, i_ab.zw), i_shape.xy) + pad; }
            else { float r = max(length(i_ab.zw), i_shape.x) + pad; lo = i_ab.xy - r; hi = i_ab.xy + r; }
            vec2 p = mix(lo, hi, corner * 0.5 + 0.5);
            v_p = p; v_ab = i_ab; v_shape = i_shape; v_color = i_color; v_extra = i_extra;
            vec2 px = (p - u_view.xy) * u_view.z;
            gl_Position = vec4(px / (u_size * 0.5) * vec2(1.0, -1.0), 0.0, 1.0);
        }`;
        glHumanoidRenderer.FRAG = `#version 300 es
        precision highp float;
        in vec2 v_p; flat in vec4 v_ab; flat in vec4 v_shape; flat in vec4 v_color; flat in vec4 v_extra;
        uniform vec3 u_light;
        out vec4 o;
        uniform float u_style;
        float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vnoise(vec2 p) {
            vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
            float kind = v_shape.z, d, r, across, along, side;
            vec2 dir;
            if (kind < 0.5) {                                   // tapered capsule
                vec2 a = v_ab.xy, ba = v_ab.zw - a, pa = v_p - a;
                float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
                vec2 off = pa - ba * t; r = mix(v_shape.x, v_shape.y, t);
                float l = length(off); d = l - r; dir = l > 1e-5 ? off / l : vec2(0.0);
                across = clamp(l / r, 0.0, 1.0);
                vec2 u = ba / max(length(ba), 1e-6); along = dot(pa, u); side = dot(off, vec2(-u.y, u.x)) / r;
            } else if (kind > 3.5) {                            // a half ring: the ellipse's outline, the half ahead of its axis
                vec2 ax = v_ab.zw; float ra = length(ax); vec2 u = ax / max(ra, 1e-6), w = vec2(-u.y, u.x);
                vec2 q = vec2(dot(v_p - v_ab.xy, u), dot(v_p - v_ab.xy, w));
                float e = length(q / vec2(ra, v_shape.x)), half_w = v_shape.y * 0.5;
                d = max(abs(e - 1.0) * min(ra, v_shape.x) - half_w, -q.x - half_w * 0.5);
                r = half_w; across = 0.0; dir = vec2(0.0); along = q.x; side = 0.0;
            } else if (kind > 2.5) {                            // a fan triangle: centre A, rim edge B→C
                vec2 A = v_ab.xy, B = v_ab.zw, Cc = v_shape.xy;
                float o = sign((B.x - A.x) * (Cc.y - A.y) - (B.y - A.y) * (Cc.x - A.x));
                vec2 eb = B - A, ec = Cc - B, ea = A - Cc, pa = v_p - A, pb = v_p - B, pc = v_p - Cc;
                float dAB = -o * (eb.x * pa.y - eb.y * pa.x) / max(length(eb), 1e-6);
                float dBC = -o * (ec.x * pb.y - ec.y * pb.x) / max(length(ec), 1e-6);
                float dCA = -o * (ea.x * pc.y - ea.y * pc.x) / max(length(ea), 1e-6);
                float px = length(fwidth(v_p));
                if (dAB > px || dCA > px) discard;              // the inner edges overlap their neighbours a pixel
                d = dBC; r = 3.0; across = clamp(1.0 + dBC / 3.0, 0.0, 1.0);
                dir = length(pa) > 1e-5 ? normalize(pa) : vec2(0.0); along = v_p.x; side = v_p.y * 0.35;
            } else {                                            // ellipse: half-axis vector, other half-axis
                vec2 ax = v_ab.zw; float ra = length(ax); vec2 u = ax / max(ra, 1e-6), w = vec2(-u.y, u.x);
                vec2 q = vec2(dot(v_p - v_ab.xy, u), dot(v_p - v_ab.xy, w));
                vec2 qn = q / vec2(ra, v_shape.x); float e = length(qn);
                r = min(ra, v_shape.x); d = (e - 1.0) * r; across = clamp(e, 0.0, 1.0);
                vec2 g = qn / vec2(ra, v_shape.x); dir = length(g) > 1e-6 ? normalize(g.x * u + g.y * w) : vec2(0.0);
                along = q.x; side = qn.y;
            }
            float aa = fwidth(d) + 1e-4;
            if (kind > 1.5 && kind < 2.5) {                   // soft shadow
                float s = 1.0 - smoothstep(-v_extra.x, 0.0, d);
                o = vec4(0.0, 0.0, 0.0, 1.0) * v_color.a * s; return;
            }
            float cover = 1.0 - smoothstep(-aa, aa, d);
            if (cover <= 0.0) discard;
            vec3 n = normalize(vec3(dir * across, sqrt(max(1.0 - across * across, 0.0)) + 0.15));
            vec3 L = normalize(u_light), base = v_color.rgb, col;
            float diff = dot(n, L), tex = v_extra.z, seed = v_extra.y * 7.31;
            if (tex > 2.5) col = base;                           // a stitched line: plain
            else if (u_style > 0.5) {
                // PAINTERLY: flat colour in two soft tone bands (like the Canvas body's shade spots),
                // a brush grain stretched along each stroke, fibres or coils in hair, and an ink edge
                float tone = smoothstep(-0.1, 0.35, diff);
                col = mix(base * 0.74, base, tone);
                col = mix(col, base * 1.1 + 0.025, smoothstep(0.72, 0.92, diff) * 0.55);
                col *= 0.94 + 0.11 * vnoise(vec2(along * 0.45, side * 2.2) + seed);
                if (tex > 1.5) {                                 // coils: a scatter of small C-shaped curls, inked
                    vec2 cp = v_p * 0.42 + seed, ci = floor(cp); float ink = 0.0, lift = 0.0;
                    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
                        vec2 cell = ci + vec2(x, y), c = cell + 0.2 + 0.6 * vec2(hash(cell), hash(cell + 3.7)), dv = cp - c;
                        float rr = 0.3 + 0.12 * hash(cell + 9.1), dist = length(dv), gap = hash(cell + 5.3) * 6.283;
                        float open = smoothstep(0.6, 1.2, abs(mod(atan(dv.y, dv.x) - gap + 3.1416, 6.283) - 3.1416));
                        ink = max(ink, (1.0 - smoothstep(0.03, 0.09, abs(dist - rr))) * open);
                        lift = max(lift, (1.0 - smoothstep(0.0, rr, dist)) * 0.5);
                    }
                    col *= (0.86 + 0.22 * lift) * (1.0 - 0.45 * ink);
                } else if (tex > 0.5) {                          // fibres: strands running back from the crown
                    float f = vnoise(vec2(along * 0.18, side * 9.0) + seed), f2 = vnoise(vec2(along * 0.3, side * 23.0) + seed * 2.3);
                    col *= 0.78 + 0.3 * f + 0.12 * f2;
                }
                col += vec3(v_shape.w * 0.22) * smoothstep(0.55, 0.0, abs(side + 0.35)) * tone;   // a soft sheen streak
                col *= mix(1.0, 0.6, smoothstep(0.8, 1.0, across));                                // the ink edge
            } else {
                vec3 h = normalize(L + vec3(0.0, 0.0, 1.0));
                float spec = pow(max(dot(n, h), 0.0), 28.0) * v_shape.w;
                col = base * (0.55 + 0.55 * max(diff, 0.0)) + vec3(spec * 0.55);
                col *= 1.0 - 0.25 * smoothstep(0.75, 1.0, across);
            }
            float a = v_color.a * cover;
            o = vec4(col * a, a);
        }`;
