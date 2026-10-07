        /**
         * Lamp Entity - No collision, just decoration.
         */
        /**
         * Lamp Entity - Now supports rotation and proper alignment.
         */
        /**
         * Lamp Entity - Now supports rotation and proper alignment.
         */
        /* Street lamps, seen from straight above, in an antiquated cast-iron style. Each style is
           painted once into a sprite (per colour and lit/unlit) and stamped; the glow and the motes
           stay live. `bulbs` are where the light sits (the lighting keys off the lamp itself). To add
           a variation, add a style here and give the lamps that should wear it its `lampType`. */
        const LAMP_IRON = '#14101a', LAMP_IRON_HI = 'rgba(176, 160, 214, 0.35)', LAMP_BRASS = '#b08a4a';
        const LAMP_STYLES = {
            // Twin lanterns on a scrolled crossarm over a fluted post (city streets and corners)
            antique_twin: {
                bulbs: [{ x: 0, y: -20 }, { x: 0, y: 20 }],
                box: [-10, -29, 20, 58],                                         // the sprite's extent round the post
                paint(c, lit, color) {
                    _lampBase(c, 0, 0, 8);
                    // the crossarm, with a scroll curling off each end, and a brass boss at the post
                    c.strokeStyle = LAMP_IRON; c.lineCap = 'round'; c.lineWidth = 3.4;
                    c.beginPath(); c.moveTo(0, -17); c.lineTo(0, 17); c.stroke();
                    c.lineWidth = 1.6;
                    for (const s of [-1, 1]) for (const side of [-1, 1]) {
                        c.beginPath(); c.moveTo(0, s * 9); c.bezierCurveTo(side * 6, s * 9, side * 7, s * 14, side * 3.5, s * 14.5);
                        c.arc(side * 3.5 + side * -1.4, s * 13.6, 1.4, side > 0 ? 0 : Math.PI, side > 0 ? Math.PI * 1.6 : Math.PI * 0.4, side < 0); c.stroke();
                    }
                    c.strokeStyle = LAMP_IRON_HI; c.lineWidth = 0.8;
                    c.beginPath(); c.moveTo(-0.9, -16); c.lineTo(-0.9, 16); c.stroke();
                    c.fillStyle = LAMP_BRASS; c.beginPath(); c.arc(0, 0, 2.2, 0, Math.PI * 2); c.fill();
                    for (const b of this.bulbs) _lampLantern(c, b.x, b.y, 7, lit, color);
                }
            },
            // A shepherd's crook curling out to one lantern (parks, the graveyard)
            antique_crook: {
                bulbs: [{ x: 22, y: 0 }],
                box: [-8, -14, 38, 23],
                paint(c, lit, color) {
                    _lampBase(c, 0, 0, 6.5);
                    c.strokeStyle = LAMP_IRON; c.lineCap = 'round'; c.lineWidth = 3;
                    c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(8, -10, 20, -11, 24, -6); c.quadraticCurveTo(26, -3, 22, -1); c.stroke();
                    c.lineWidth = 1.4;                                           // the little scroll under the arm
                    c.beginPath(); c.moveTo(5, -4); c.quadraticCurveTo(10, -3, 11, -7); c.arc(9.8, -7, 1.2, 0, Math.PI * 1.5, true); c.stroke();
                    c.strokeStyle = LAMP_IRON_HI; c.lineWidth = 0.7;
                    c.beginPath(); c.moveTo(1, -1.5); c.bezierCurveTo(8, -11, 19, -12, 23, -7.5); c.stroke();
                    for (const b of this.bulbs) _lampLantern(c, b.x, b.y, 6.5, lit, color);
                }
            }
        };
        const LAMP_TYPE_STYLE = { 1: 'antique_crook', 2: 'antique_twin' };
        const LAMP_POST_SCALE = 1.5; // Street and entrance posts, scaled around their ground anchors.

        // The fluted cast-iron foot of the post, ringed in brass
        function _lampBase(c, x, y, r) {
            const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
            g.addColorStop(0, '#3a3046'); g.addColorStop(0.55, '#1c1624'); g.addColorStop(1, '#0b080f');
            c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
            c.strokeStyle = 'rgba(0, 0, 0, 0.55)'; c.lineWidth = 0.8;
            for (let i = 0; i < 12; i++) {                                       // the flutes
                const a = i / 12 * Math.PI * 2;
                c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55); c.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); c.stroke();
            }
            c.strokeStyle = LAMP_BRASS; c.lineWidth = 1;
            c.beginPath(); c.arc(x, y, r * 0.5, 0, Math.PI * 2); c.stroke();
            c.strokeStyle = LAMP_IRON_HI; c.lineWidth = 0.7;
            c.beginPath(); c.arc(x, y, r - 0.6, Math.PI * 1.05, Math.PI * 1.6); c.stroke();
        }

        // A hexagonal lantern from above: lit glass round the edge of its iron cap, a brass finial on top
        function _lampLantern(c, x, y, r, lit, color) {
            const hex = (rr, rot = Math.PI / 6) => { c.beginPath(); for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); };
            if (lit) {
                const g = c.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, '#fffaf0'); g.addColorStop(0.55, color); g.addColorStop(1, color);
                c.fillStyle = g;
            } else c.fillStyle = '#2a2433';
            hex(r); c.fill();
            c.strokeStyle = LAMP_IRON; c.lineWidth = 1.2; c.stroke();
            c.lineWidth = 0.8;                                                   // the frame's corner ribs
            for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.62); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.stroke(); }
            c.fillStyle = LAMP_IRON; hex(r * 0.5); c.fill();                     // the cap
            c.strokeStyle = 'rgba(176, 138, 74, 0.8)'; c.lineWidth = 0.7; c.stroke();
            c.strokeStyle = LAMP_IRON_HI; c.lineWidth = 0.6;
            c.beginPath(); c.moveTo(x - r * 0.45, y - r * 0.2); c.lineTo(x - r * 0.1, y - r * 0.45); c.stroke();
            c.fillStyle = LAMP_BRASS; c.beginPath(); c.arc(x, y, r * 0.17, 0, Math.PI * 2); c.fill();
        }

        // Bulb artwork lives above the darkness layer; the old lamp bodies keep their materials.
        // Gradients and pane masks are baked once, so each lit bulb costs one sprite draw.
        const _lampBulbEmissionSprites = new Map();
        function _lampBulbEmissionSprite(color, radius, shape = 'lantern', S = 3) {
            color = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffeebb';
            const key = `${color}|${radius}|${shape}|${S}`;
            let cv = _lampBulbEmissionSprites.get(key);
            if (cv) return cv;
            cv = document.createElement('canvas'); cv.width = cv.height = 48 * S;
            const c = cv.getContext('2d'); c.setTransform(S, 0, 0, S, 24 * S, 24 * S);
            const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)).join(',');
            const haloRadius = shape === 'globe' ? 18 : 24;
            const halo = c.createRadialGradient(0, 0, radius * .6, 0, 0, haloRadius);
            halo.addColorStop(0, `rgba(${rgb},0.30)`); halo.addColorStop(.25, `rgba(${rgb},0.20)`);
            halo.addColorStop(.6, `rgba(${rgb},0.07)`); halo.addColorStop(1, `rgba(${rgb},0)`);
            c.fillStyle = halo; c.fillRect(-24, -24, 48, 48);
            const bloomRadius = radius * 1.65;
            const bloom = c.createRadialGradient(0, 0, radius * .45, 0, 0, bloomRadius);
            bloom.addColorStop(0, 'rgba(255,249,230,0.40)');
            bloom.addColorStop(.48, `rgba(${rgb},0.26)`); bloom.addColorStop(1, `rgba(${rgb},0)`);
            c.fillStyle = bloom; c.beginPath(); c.arc(0, 0, bloomRadius, 0, Math.PI * 2); c.fill();
            if (shape === 'globe') {
                const face = c.createRadialGradient(-radius * .12, -radius * .15, 0, 0, 0, radius);
                face.addColorStop(0, '#ffffff'); face.addColorStop(.55, '#fffdf4');
                face.addColorStop(.85, '#fff1ce'); face.addColorStop(1, color);
                c.fillStyle = face; c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.fill();
            } else {
                // Light shines between the original corner ribs, leaving the iron cap opaque.
                const face = c.createRadialGradient(0, 0, radius * .45, 0, 0, radius);
                face.addColorStop(0, '#fff8e2'); face.addColorStop(.32, '#fffef9');
                face.addColorStop(.70, '#fff5d9'); face.addColorStop(1, color);
                c.fillStyle = face;
                const points = Array.from({length:6}, (_, i) => {
                    const a = Math.PI / 6 + i * Math.PI / 3; return {x:Math.cos(a),y:Math.sin(a)};
                });
                for (let i = 0; i < 6; i++) {
                    const p = points[i], q = points[(i + 1) % 6], inset = .12;
                    const a = {x:p.x+(q.x-p.x)*inset,y:p.y+(q.y-p.y)*inset};
                    const b = {x:q.x+(p.x-q.x)*inset,y:q.y+(p.y-q.y)*inset};
                    c.beginPath(); c.moveTo(a.x * radius * .91, a.y * radius * .91);
                    c.lineTo(b.x * radius * .91, b.y * radius * .91);
                    c.lineTo(b.x * radius * .59, b.y * radius * .59);
                    c.lineTo(a.x * radius * .59, a.y * radius * .59); c.closePath(); c.fill();
                }
            }
            _lampBulbEmissionSprites.set(key, cv);
            return cv;
        }

        const _lampSprites = new Map();
        /** A lamp style painted once (cropped to its `box`) per colour, lit state and size:
         *  1× when the city is seen from afar, 3× up close, so a zoomed-out street isn't shrinking big sprites. */
        function lampSprite(style, color, lit, S = 3) {
            const key = style + '|' + color + '|' + (lit ? 1 : 0) + '|' + S;
            let cv = _lampSprites.get(key);
            if (!cv) {
                const [bx, by, bw, bh] = LAMP_STYLES[style].box;
                cv = document.createElement('canvas'); cv.width = Math.ceil(bw * S); cv.height = Math.ceil(bh * S);
                const c = cv.getContext('2d'); c.setTransform(S, 0, 0, S, -bx * S, -by * S);
                LAMP_STYLES[style].paint(c, lit, color);
                _lampSprites.set(key, cv);
            }
            return cv;
        }

        function lampPaintInView(lamp, ctx, view, zoom, daylight) {
            if (!lamp || lamp.draw !== LampEntity.prototype.draw || lamp._glow !== LampEntity.prototype._glow ||
                !Number.isFinite(daylight) || !Number.isFinite(lamp._lightK ?? 1)) return true;
            if (view && lamp.x >= view.left && lamp.x <= view.right && lamp.y >= view.top && lamp.y <= view.bottom) return true;
            const style = LAMP_TYPE_STYLE[lamp.lampType], on = daylight < 0.2 && !lamp._forcedOff;
            let left, top, right, bottom;
            if (style === 'antique_crook' || style === 'antique_twin') {
                const spec = LAMP_STYLES[style], box = spec.box;
                if (!box || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0 || !Array.isArray(spec.bulbs)) return true;
                left = box[0]; top = box[1]; right = left + box[2]; bottom = top + box[3];
                if (on) for (const b of spec.bulbs) {
                    if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return true;
                    // The 24-unit glow also contains every 18-unit orbit plus its 1.2-unit mote.
                    left = Math.min(left, b.x - 24); right = Math.max(right, b.x + 24);
                    top = Math.min(top, b.y - 24); bottom = Math.max(bottom, b.y + 24);
                }
            } else if (lamp.lampType === 3 || lamp.lampType === 4 || lamp.lampType === 5) {
                const r = on ? (lamp.lampType === 4 ? 34 : 24) : lamp.lampType === 4 ? 12 : 8;
                left = -r; right = r; top = lamp.lampType === 5 ? Math.min(-12, -r) : -r;
                bottom = lamp.lampType === 5 ? Math.max(12, r) : r;
            } else return true;
            const scale = style ? LAMP_POST_SCALE : 1;
            return worldPaintBoxInView(ctx, view, zoom, lamp.x, lamp.y, left * scale, top * scale, right * scale, bottom * scale, lamp.angle);
        }

        class LampEntity extends GameEntity {
            constructor(config) {
                super({
                    ...config,
                    type: 'lamp',
                    hasCollision: false,
                    collisionLayer: GameEntity.LAYER.NONE
                });
                
                this.lampType = config.lampType || 2;
                this.angle = config.angle || 0; // Orientation in radians
                
                // Use color/radius from config or defaults
                this.color = config.color || (this.lampType === 1 ? '#ffaa55' : '#ffeebb');
                this.lightRadius = config.lightRadius || (this.lampType === 1 ? 200 : 350);
                
                // --- CRITICAL FIX ---
                // Overwrite the default GameEntity radius (which is small for collision)
                // with the lightRadius so the LightingSystem knows how far to draw the glow.
                this.radius = this.lightRadius;
                
                // Random offset so lamps don't all twinkle in perfect unison
                this.animOffset = Math.random() * 10000;
            }
            
            update() { }

            /** Only the luminous panes and bloom: drawn after the world's darkness, never the post. */
            drawEmissive(ctx, daylight = 0) {
                const style = LAMP_TYPE_STYLE[this.lampType], k = Math.max(0, Math.min(1, this._lightK ?? 1));
                if (!style || !this.visible || daylight >= .2 || this._forcedOff || k < .02) return;
                ctx.save();
                ctx.translate(this.x, this.y); ctx.rotate(this.angle); ctx.scale(LAMP_POST_SCALE, LAMP_POST_SCALE);
                const m = ctx.getTransform(), density = Math.hypot(m.a, m.b);
                const S = density > 1.6 ? 3 : density > .8 ? 2 : 1;
                const radius = style === 'antique_twin' ? 7 : 6.5;
                ctx.globalAlpha *= k;
                for (const b of LAMP_STYLES[style].bulbs) {
                    ctx.drawImage(_lampBulbEmissionSprite(this.color, radius, 'lantern', S), b.x - 24, b.y - 24, 48, 48);
                }
                ctx.restore();
            }

            /** This lamp's glow sprite (core/draw-helpers.js). */
            _glow() { return this._glowCv || (this._glowCv = glowSprite(/^#[0-9a-f]{6}$/i.test(this.color) ? this.color : '#ffeebb', 0.3)); }
            
            draw(ctx, daylight = 0) {
                if (!this.visible) return;
                
                const isOn = daylight < 0.2 && !this._forcedOff;
        
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.angle);
        
                // 1. DETERMINE BULB POSITIONS (Relative to 0,0)
                let bulbs = [];
                
                const style = LAMP_TYPE_STYLE[this.lampType];
                if (style) ctx.scale(LAMP_POST_SCALE, LAMP_POST_SCALE);
                if (style) { // A street lamp: its antique style, a baked sprite (LAMP_STYLES)
                    bulbs = LAMP_STYLES[style].bulbs;
                    
                } else if (this.lampType === 3) { // Wall Mounted (circular)
                     bulbs.push({x: 0, y: 0});
                     ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.fill();
                     
                } else if (this.lampType === 5) { // Wall Strip (narrow rectangular sconce)
                     bulbs.push({x: 0, y: 0});
                     // Rectangular housing
                     ctx.fillStyle = '#1a1a1a';
                     ctx.fillRect(-3, -12, 6, 24);
                     // Warm glow strip
                     if (isOn) {
                         const k = this._lightK ?? 1;
                         ctx.globalAlpha = 0.7 * k;
                         ctx.drawImage(this._glow(), -12, -22, 24, 44);
                         ctx.globalAlpha = k;
                         ctx.fillStyle = this.color;
                         ctx.fillRect(-2, -10, 4, 20);
                         ctx.globalAlpha = 1;
                     } else {
                         ctx.fillStyle = '#333';
                         ctx.fillRect(-2, -10, 4, 20);
                     }
                     
                } else if (this.lampType === 4) { // Floor Lamp
                     bulbs.push({x: 0, y: 0});
                     
                }
        
                // 2. DRAW BULBS — a glow sprite behind each (faded with the room's light)
                const k = this._lightK ?? 1, big = this.lampType === 4;
                if (style) {
                    const col = /^#[0-9a-f]{6}$/i.test(this.color) ? this.color : '#ffeebb';
                    const m = ctx.getTransform(), S = Math.hypot(m.a, m.b) > 1.6 ? 3 : Math.hypot(m.a, m.b) > 0.8 ? 2 : 1;
                    const [bx, by, bw, bh] = LAMP_STYLES[style].box;
                    if (isOn) {
                        ctx.globalAlpha = 0.85 * k;
                        for (const b of bulbs) ctx.drawImage(this._glow(), b.x - 24, b.y - 24, 48, 48);
                        ctx.globalAlpha = 1;
                        if (k < 1) ctx.drawImage(lampSprite(style, col, false, S), bx, by, bw, bh);
                        ctx.globalAlpha = k;
                    }
                    ctx.drawImage(lampSprite(style, col, isOn, S), bx, by, bw, bh);
                    ctx.globalAlpha = 1;
                }
                for (let b of style ? [] : bulbs) {
                    const r = big ? 12 : 8;
                    if (isOn) {
                        const gr = big ? 34 : 24;
                        ctx.globalAlpha = 0.85 * k;
                        ctx.drawImage(this._glow(), b.x - gr, b.y - gr, gr * 2, gr * 2);
                        ctx.globalAlpha = 1;
                        if (k < 1) { ctx.fillStyle = '#444444'; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = k; }
                        ctx.fillStyle = this.color;
                    } else {
                        ctx.fillStyle = '#444444';
                    }
                    ctx.beginPath(); 
                    ctx.arc(b.x, b.y, r, 0, Math.PI*2); 
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
        
                // 3. DRAW PARTICLES (skip when zoomed out — invisible at distance)
                if (isOn && _zoomLOD < 1) {
                    const time = (_frameTime + this.animOffset) / 1000;
                    ctx.fillStyle = '#ffffff'; 
                    
                    for (let b of bulbs) {
                        for(let i = 0; i < 4; i++) {
                            const speed = 0.8 + (i * 0.2);
                            const angle = time * speed + (i * 2); 
                            const dist = 12 + Math.sin(time * 2 + i) * 6; 
                            const px = b.x + Math.cos(angle) * dist;
                            const py = b.y + Math.sin(angle) * dist;
                            const alpha = 0.4 + Math.sin(time * 5 + i) * 0.4;
                            
                            if (alpha > 0) {
                                ctx.globalAlpha = alpha;
                                ctx.beginPath();
                                ctx.arc(px, py, 1.2, 0, Math.PI*2);
                                ctx.fill();
                            }
                        }
                    }
                    ctx.globalAlpha = 1.0;
                }
                
                ctx.restore();
            }
        }

