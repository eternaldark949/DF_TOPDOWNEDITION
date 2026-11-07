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
        //   sheen   how much a highlight it takes (the material kit's rule)
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
                this.program = this._program(glHumanoidRenderer.VERT, glHumanoidRenderer.FRAG);
                this.u_view = gl.getUniformLocation(this.program, 'u_view');
                this.u_light = gl.getUniformLocation(this.program, 'u_light');
                this.u_size = gl.getUniformLocation(this.program, 'u_size');
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

            rgb(hex) {
                let c = this.colors.get(hex);
                if (!c) {
                    const n = parseInt(String(hex || '#888888').replace('#', '').padEnd(6, '0').slice(0, 6), 16);
                    this.colors.set(hex, c = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
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
                d[o + 12] = soft; d[o + 13] = this.count; d[o + 14] = 0; d[o + 15] = 0;
            }

            /** A person: pose the skeleton (no drawing), then lay down their shapes back to front. */
            addBody(entity, config) {
                const h = proceduralHumanoid.of(entity).skeleton(entity, config), BC = h.body, g = h.geometry, C = h.clothes;
                const ex = entity.x, ey = entity.y, ang = entity.angle || 0, ca = Math.cos(ang), sa = Math.sin(ang), alpha = entity.life ?? 1;
                // body frame (x forward, y right) → world
                const wx = (x, y) => ex + x * ca - y * sa, wy = (x, y) => ey + x * sa + y * ca;
                const capsule = (x1, y1, x2, y2, r1, r2, rgb, sheen) => this.shape(wx(x1, y1), wy(x1, y1), wx(x2, y2), wy(x2, y2), r1, r2, 0, sheen, rgb, alpha);
                const ellipse = (cx, cy, axx, axy, rb, rgb, sheen, kind = 1, a = alpha, soft = 0) =>
                    this.shape(wx(cx, cy), wy(cx, cy), axx * ca - axy * sa, axx * sa + axy * ca, rb, 0, kind, sheen, rgb, a, soft);
                const F = (item) => (typeof materialKit !== 'undefined' && item ? materialKit.finishOf(item).sheen || 0 : 0);
                const skin = this.rgb(h.skin), top = C.top ? this.rgb(C.top.color) : skin, bottom = C.bottom ? this.rgb(C.bottom.under || C.bottom.color) : skin;
                const shoe = this.rgb(C.shoes ? C.shoes.color : '#1a1a1a'), hair = C.hair && C.hair.color ? this.rgb(C.hair.color) : null;
                const topSheen = F(C.top), botSheen = F(C.bottom), sleeve = h.sleeve, sleeveRgb = h.sleeve_color ? this.rgb(h.sleeve_color) : top;
                const upperRgb = sleeve && sleeve !== 'none' ? sleeveRgb : skin, foreRgb = sleeve === 'long' ? sleeveRgb : skin;

                ellipse(-2, 0, 13, 0, 11, this.SHADOW, 0, 2, 0.32 * alpha, 5);   // contact shadow
                // Legs: thigh and calf each side, then the feet
                for (let i = 0; i < 2; i++) {
                    const [hx, hy] = g.hipPt[i], [kx, ky] = g.knees[i], [fx, fy] = g.feet[i];
                    capsule(fx, fy, kx, ky, BC.calf[3], BC.calf[1], bottom, botSheen);
                    capsule(kx, ky, hx, hy, BC.calf[1], BC.thigh[0], bottom, botSheen);
                    ellipse(fx + 2.2, fy, 3.2 * BC.foot, 0, 1.9 * BC.foot, shoe, 0.4);
                }
                // Arms: hands, forearms, upper arms (from the shoulders, turned with the torso)
                const torC = Math.cos(h.torso_rotation), torS = Math.sin(h.torso_rotation), sx = h.shoulder_x;
                for (let i = 0; i < 2; i++) {
                    const shY = i ? BC.sh : -BC.sh, shx = sx - shY * torS, shy = shY * torC;
                    const exn = h.elbows[i * 2], eyn = h.elbows[i * 2 + 1], fxn = h.fists[i * 2], fyn = h.fists[i * 2 + 1];
                    ellipse(fxn, fyn, 2.1 * BC.hand, 0, 1.8 * BC.hand, skin, 0);
                    capsule(fxn, fyn, exn, eyn, BC.fore[3], BC.fore[0], foreRgb, sleeve === 'long' ? topSheen : 0);
                    capsule(exn, eyn, shx, shy, BC.upper[3], BC.upper[0], upperRgb, sleeve !== 'none' ? topSheen : 0);
                }
                // Torso: hips, then the chest and back, turned with the torso
                const hx = h.hip_anchor_x;
                ellipse(hx + (BC.hf + BC.hb) / 2, 0, (BC.hf - BC.hb) / 2, 0, BC.hw * 0.62, bottom, botSheen);
                const cx = hx + (BC.tf + BC.tb) / 2, half = (BC.tf - BC.tb) / 2;
                ellipse(cx, 0, half * torC, half * torS, BC.sh + 1.2, top, topSheen);
                // Shoulder caps over the arm roots, the sleeve's colour
                for (const sy of [-BC.sh, BC.sh]) ellipse(sx - sy * torS + 0.4, sy * torC, BC.del * 1.06, 0, BC.del * 0.8, upperRgb, topSheen);
                // Head and hair: the crown from the Canvas hair's own table (HAIR_CROWNS), long styles hanging behind
                const headX = g.headX, hr = 7.4, crown = hair && typeof HAIR_CROWNS !== 'undefined' ? HAIR_CROWNS[C.hair.type] : null;
                if (hair && (C.hair.type === 'ponytail' || C.hair.type === 'long' || C.hair.type === 'braids' || C.hair.type === 'dreadlocks'))
                    capsule(headX - 4, 0, headX - (C.hair.type === 'ponytail' ? 17 : 13), 0, C.hair.type === 'ponytail' ? 3.2 : 8.5, C.hair.type === 'ponytail' ? 1.8 : 6.5, hair, 0.5);
                ellipse(headX + 0.5, 0, hr, 0, hr * 0.92, skin, 0);
                if (crown) ellipse(headX + crown[0] - 0.8, 0, crown[1] * 0.92, 0, crown[2] * 0.92, hair, crown[3] === 'coil' ? 0.12 : 0.6);
                if (C.hat && C.hat.color) {                                     // a hat: brim, then crown
                    const hc = this.rgb(C.hat.color), hb = this.rgb(C.hat.band || C.hat.color);
                    ellipse(headX - 0.5, 0, hr + 3.6, 0, hr + 3.2, hc, 0.3);
                    ellipse(headX - 0.5, 0, hr * 0.85, 0, hr * 0.8, hb, 0.5);
                }
            }

            /** Draw everything added since begin() in one instanced call. */
            flush() {
                const gl = this.gl, W = this.canvas.width, H = this.canvas.height, [cx, cy, z] = this.cam;
                gl.viewport(0, 0, W, H);
                gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
                gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                gl.useProgram(this.program); gl.bindVertexArray(this.vao);
                gl.uniform4f(this.u_view, cx, cy, z, 0); gl.uniform3f(this.u_light, -0.45, -0.55, 0.7); gl.uniform2f(this.u_size, W, H);
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
        void main() {
            float kind = v_shape.z, d, r, across;
            vec2 dir;
            if (kind < 0.5) {                                   // tapered capsule
                vec2 a = v_ab.xy, ba = v_ab.zw - a, pa = v_p - a;
                float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
                vec2 off = pa - ba * t; r = mix(v_shape.x, v_shape.y, t);
                float l = length(off); d = l - r; dir = l > 1e-5 ? off / l : vec2(0.0);
                across = clamp(l / r, 0.0, 1.0);
            } else {                                            // ellipse: half-axis vector, other half-axis
                vec2 ax = v_ab.zw; float ra = length(ax); vec2 u = ax / max(ra, 1e-6), w = vec2(-u.y, u.x);
                vec2 q = vec2(dot(v_p - v_ab.xy, u), dot(v_p - v_ab.xy, w));
                vec2 qn = q / vec2(ra, v_shape.x); float e = length(qn);
                r = min(ra, v_shape.x); d = (e - 1.0) * r; across = clamp(e, 0.0, 1.0);
                vec2 g = qn / vec2(ra, v_shape.x); dir = length(g) > 1e-6 ? normalize(g.x * u + g.y * w) : vec2(0.0);
            }
            float aa = fwidth(d) + 1e-4;
            if (kind > 1.5) {                                   // soft shadow
                float s = 1.0 - smoothstep(-v_extra.x, 0.0, d);
                o = vec4(0.0, 0.0, 0.0, 1.0) * v_color.a * s; return;
            }
            float cover = 1.0 - smoothstep(-aa, aa, d);
            if (cover <= 0.0) discard;
            vec3 n = normalize(vec3(dir * across, sqrt(max(1.0 - across * across, 0.0)) + 0.15));
            vec3 L = normalize(u_light);
            float diff = max(dot(n, L), 0.0);
            vec3 h = normalize(L + vec3(0.0, 0.0, 1.0));
            float spec = pow(max(dot(n, h), 0.0), 28.0) * v_shape.w;
            vec3 col = v_color.rgb * (0.55 + 0.55 * diff) + vec3(spec * 0.55);
            col *= 1.0 - 0.25 * smoothstep(0.75, 1.0, across);  // a darker rim where it turns away
            float a = v_color.a * cover;
            o = vec4(col * a, a);
        }`;
