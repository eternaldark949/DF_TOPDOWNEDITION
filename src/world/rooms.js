        // ============================================================================
        //  ROOM SYSTEM — the standard for every indoor map
        //  Gives indoor maps the same depth as outdoor: rooms, doors, windows, linens.
        //  Each room carries its own type (indoor/outdoor) enabling per-room weather,
        //  daylight projection through windows, and door animations.
        //
        //  How it looks: the room 949 is in is fully seen; the others sit in a soft
        //  violet shadow (feathered, never a hard cut) and brighten as she walks in,
        //  with light spilling through doorways as the doors open. From an outdoor
        //  room (a veranda) the interior dims as if seen through glass — its lamps
        //  keep glowing. Outdoor rooms carry the sky's light, so a veranda is bright
        //  at noon. Room lights fade when switched. Everything eases over time.
        //
        //  Giving an indoor map rooms — add an entry to ROOM_DEFS below:
        //    rooms    { id: { x, y, w, h, type: 'indoor'|'outdoor', label } } — cover
        //             every walkable area; outdoor rooms get sky light and weather.
        //             An L-shaped or odd room: { rects: [{x,y,w,h}, ...], type, label }
        //    doors    { x, y, w, h, type: 'sliding'|'hinged'|'arch', orientation: 'H'|'V',
        //               rooms: [a, b] } — the two rooms it joins (light spills
        //             through it); walls are cut for doors automatically. An arch is
        //             an open doorway: always open, no leaf. Make doors ≥ 70 px wide so
        //             enemies path through them. Bullets strike hinged and sliding
        //             doors (hitDoors) and push them by their force.
        //    windows  { x, y, w, h, facing: 'N'|'S'|'E'|'W' } — daylight projections
        //    linens   decorative cloth
        //  and give light switches (map-entities.js) the `roomId` they control.
        //  Lamps are tagged with their room when the map loads.
        // ============================================================================
        const ROOM_LOOK = {
            AWAY_VIS: 0.55,        // rooms 949 isn't in
            GLASS_VIS: 0.35,       // indoor rooms seen from outside
            DOOR_SPILL: 0.85,      // how far an open door lifts the room beyond it
            VEIL_MAX: 1.0,         // veil strength at vis 0 (away rooms ≈ 0.45, from outdoors ≈ 0.65)
            VEIL_RGB: '16, 8, 34', // violet-indigo, the night's own colour
            FEATHER: 12,           // world px per veil texel (edge softness)
            VIS_RATE: 5, LIGHT_RATE: 9, OUTDOOR_RATE: 4   // easing, per second
        };
        
        /**
         * IndoorWindow — Projects daylight/exterior glow through walls.
         * Facing direction determines which way light enters.
         */
        class IndoorWindow {
            constructor(config) {
                this.x = config.x;
                this.y = config.y;
                this.w = config.w || 60;
                this.h = config.h || 8;
                this.facing = config.facing || 'S';
                this.tint = config.tint || '255, 240, 200';
                this.projectionLength = config.projectionLength || 120;
                
                // Shatter state
                this.shattered = false;
                this.shatterTime = 0;
                this._shardOffsets = [];
            }
            
            /**
             * Check if a point (projectile/explosion) hits this window.
             * Returns true if shattered by this hit.
             */
            tryShatter(px, py, radius) {
                radius = radius || 5;
                if (this.shattered) return false;
                if (px + radius > this.x && px - radius < this.x + this.w &&
                    py + radius > this.y && py - radius < this.y + this.h) {
                    this.shattered = true;
                    this.shatterTime = _frameTime;
                    for (let i = 0; i < 6; i++) {
                        this._shardOffsets.push({
                            x: (Math.random() - 0.5) * this.w * 1.5,
                            y: (Math.random() - 0.5) * 20 + (this.facing === 'S' ? 15 : this.facing === 'N' ? -15 : 0),
                            size: 2 + Math.random() * 4,
                            angle: Math.random() * Math.PI * 2
                        });
                    }
                    return true;
                }
                return false;
            }
            
            draw(ctx, daylight) {
                if (this.shattered) {
                    // Broken window: dark void + glass shards
                    ctx.fillStyle = 'rgba(10, 15, 25, 0.6)';
                    ctx.fillRect(this.x, this.y, this.w, this.h);
                    ctx.strokeStyle = 'rgba(150, 180, 200, 0.3)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(this.x, this.y, this.w, this.h);
                    const age = Math.min(1, (_frameTime - this.shatterTime) / 2000);
                    const shardAlpha = Math.max(0.1, 0.6 - age * 0.5);
                    ctx.fillStyle = 'rgba(180, 200, 220, ' + shardAlpha + ')';
                    for (const shard of this._shardOffsets) {
                        ctx.save();
                        ctx.translate(this.x + this.w / 2 + shard.x, this.y + this.h / 2 + shard.y);
                        ctx.rotate(shard.angle);
                        ctx.fillRect(-shard.size / 2, -1, shard.size, 2);
                        ctx.restore();
                    }
                    return;
                }
                
                // Intact window — colored chunk in the wall
                ctx.fillStyle = daylight > 0.1 
                    ? 'rgba(200, 220, 255, ' + (0.15 + daylight * 0.5) + ')'
                    : 'rgba(30, 30, 50, 0.8)';
                ctx.fillRect(this.x, this.y, this.w, this.h);
                ctx.fillStyle = 'rgba(' + this.tint + ', ' + (0.1 + daylight * 0.4) + ')';
                if (this.facing === 'S' || this.facing === 'N') {
                    ctx.fillRect(this.x, this.y, this.w, 2);
                } else {
                    ctx.fillRect(this.x, this.y, 2, this.h);
                }
            }
            
            /**
             * Draw the light projection cone on the lighting layer.
             * Uses destination-out to cut a bright trapezoid into the shadow.
             */
            drawLightProjection(lightCtx, daylight) {
                if (daylight < 0.05) return; // No projection at night
                
                const alpha = daylight * 0.7;
                const pLen = this.projectionLength * daylight;
                const spread = this.w * 0.4; // How much wider the projection gets
                
                lightCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                lightCtx.beginPath();
                
                const cx = this.x + this.w / 2;
                const cy = this.y + this.h / 2;
                
                switch (this.facing) {
                    case 'S': // Light enters downward
                        lightCtx.moveTo(this.x, this.y + this.h);
                        lightCtx.lineTo(this.x - spread, this.y + this.h + pLen);
                        lightCtx.lineTo(this.x + this.w + spread, this.y + this.h + pLen);
                        lightCtx.lineTo(this.x + this.w, this.y + this.h);
                        break;
                    case 'N': // Light enters upward
                        lightCtx.moveTo(this.x, this.y);
                        lightCtx.lineTo(this.x - spread, this.y - pLen);
                        lightCtx.lineTo(this.x + this.w + spread, this.y - pLen);
                        lightCtx.lineTo(this.x + this.w, this.y);
                        break;
                    case 'E': // Light enters rightward
                        lightCtx.moveTo(this.x + this.w, this.y);
                        lightCtx.lineTo(this.x + this.w + pLen, this.y - spread);
                        lightCtx.lineTo(this.x + this.w + pLen, this.y + this.h + spread);
                        lightCtx.lineTo(this.x + this.w, this.y + this.h);
                        break;
                    case 'W': // Light enters leftward
                        lightCtx.moveTo(this.x, this.y);
                        lightCtx.lineTo(this.x - pLen, this.y - spread);
                        lightCtx.lineTo(this.x - pLen, this.y + this.h + spread);
                        lightCtx.lineTo(this.x, this.y + this.h);
                        break;
                }
                lightCtx.fill();
            }
            
            /**
             * Draw colored light pass (lighter blend) — warm daylight tint.
             */
            drawColorProjection(lightCtx, daylight) {
                if (daylight < 0.05) return;
                
                const pLen = this.projectionLength * daylight * 0.7;
                const spread = this.w * 0.3;
                const cx = this.x + this.w / 2;
                let cy;
                
                switch (this.facing) {
                    case 'S': cy = this.y + this.h + pLen * 0.5; break;
                    case 'N': cy = this.y - pLen * 0.5; break;
                    case 'E': cy = this.y + this.h / 2; break;
                    case 'W': cy = this.y + this.h / 2; break;
                    default: cy = this.y + pLen * 0.5;
                }
                
                const grad = lightCtx.createRadialGradient(
                    this.facing === 'E' ? this.x + this.w + pLen * 0.4 : this.facing === 'W' ? this.x - pLen * 0.4 : cx,
                    cy, 5,
                    this.facing === 'E' ? this.x + this.w + pLen * 0.4 : this.facing === 'W' ? this.x - pLen * 0.4 : cx,
                    cy, pLen
                );
                grad.addColorStop(0, `rgba(${this.tint}, ${daylight * 0.15})`);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                
                lightCtx.globalAlpha = daylight * 0.3;
                lightCtx.fillStyle = grad;
                lightCtx.beginPath();
                lightCtx.arc(
                    this.facing === 'E' ? this.x + this.w + pLen * 0.4 : this.facing === 'W' ? this.x - pLen * 0.4 : cx,
                    cy, pLen, 0, Math.PI * 2
                );
                lightCtx.fill();
                lightCtx.globalAlpha = 1.0;
            }
        }
        
        /**
         * IndoorDoor — Sliding or hinged door between rooms.
         * Auto-opens when player is nearby, auto-closes when they leave.
         */
        class IndoorDoor {
            constructor(config) {
                this.x = config.x;
                this.y = config.y;
                this.w = config.w || 60;
                this.h = config.h || 8;
                this.type = config.type || 'sliding';
                this.orientation = config.orientation || 'H';
                this.rooms = config.rooms || [null, null];
                this.color = config.color || '#555';
                this.triggerRadius = config.triggerRadius || 80;
                
                this.openAmount = 0;
                this.targetOpen = 0;
                this.speed = config.speed || 0.08;
                
                // Hinged door: a physical leaf that actors push open and a spring swings shut.
                // angle 0 = closed; either sign = open to one side or the other.
                this.hingeSide = config.hingeSide || 'left';
                this.angle = 0;
                this.angVel = 0;
                this.thickness = 6;
                if (this.orientation === 'H') {
                    this.hx = this.hingeSide === 'left' ? this.x : this.x + this.w; this.hy = this.y + this.h / 2;
                    this.baseAngle = this.hingeSide === 'left' ? 0 : Math.PI; this.length = this.w;
                } else {
                    this.hx = this.x + this.w / 2; this.hy = this.hingeSide === 'left' ? this.y : this.y + this.h;
                    this.baseAngle = this.hingeSide === 'left' ? Math.PI / 2 : -Math.PI / 2; this.length = this.h;
                }
                // Sliding glass: a bullet knocks the panels in their track (a small spring)
                this.jolt = 0; this.joltV = 0;
                this._actorNear = false;                             // someone besides 949 at the door
                // An arch is an open doorway: nothing to draw open or shut, light always passes
                if (this.type === 'arch') { this.openAmount = 1; this.targetOpen = 1; }
            }

            /** The solid parts of the door right now, as segments [x0, y0, x1, y1] (with a half-thickness). */
            leaves() {
                if (this.type === 'hinged') {
                    const a = this.baseAngle + this.angle;
                    return [[this.hx, this.hy, this.hx + Math.cos(a) * this.length, this.hy + Math.sin(a) * this.length]];
                }
                if (this.type !== 'sliding') return [];
                // The two panels, clipped to the doorway (the parts slid into the wall are behind the wall)
                const out = [], off = this.openAmount * ((this.orientation === 'H' ? this.w : this.h) / 2 + 4);
                const clip = (a, b, lo, hi, add) => { a = Math.max(a, lo); b = Math.min(b, hi); if (b - a > 2) add(a, b); };
                if (this.orientation === 'H') {
                    const cy = this.y + this.h / 2, mid = this.x + this.w / 2, add = (a, b) => out.push([a, cy, b, cy]);
                    clip(this.x - off, mid - 2 - off, this.x, this.x + this.w, add);
                    clip(mid + 2 + off, this.x + this.w + off, this.x, this.x + this.w, add);
                } else {
                    const cx = this.x + this.w / 2, mid = this.y + this.h / 2, add = (a, b) => out.push([cx, a, cx, b]);
                    clip(this.y - off, mid - 2 - off, this.y, this.y + this.h, add);
                    clip(mid + 2 + off, this.y + this.h + off, this.y, this.y + this.h, add);
                }
                return out;
            }

            /** Half the leaf's thickness, for hit tests. */
            get halfThick() { return this.type === 'hinged' ? this.thickness / 2 : Math.min(this.w, this.h) / 2; }

            /**
             * A bullet strikes the door at (ix, iy): its force (damage × speed, the same force
             * that knocks people back) swings a hinged leaf about its hinge, or knocks a glass
             * panel in its track. A punch pushes gently.
             */
            strike(p, ix, iy) {
                const spd = Math.hypot(p.vx, p.vy) || 1, dx = p.vx / spd, dy = p.vy / spd;
                const F = Math.min(3000, (p.damage || 10) * spd) * (p.melee ? 0.5 : 1);
                if (this.type === 'hinged') {
                    const L = this.length, a = this.baseAngle + this.angle, ux = Math.cos(a), uy = Math.sin(a);
                    const s = Math.max(0, Math.min(L, (ix - this.hx) * ux + (iy - this.hy) * uy));
                    this.angVel += s * (ux * dy - uy * dx) * F * 0.005 / (L * L / 3);
                    this.angVel = Math.max(-0.5, Math.min(0.5, this.angVel));
                } else if (this.type === 'sliding') {
                    const n = this.orientation === 'H' ? dy : dx;              // across the track
                    this.joltV += Math.sign(n || 1) * Math.min(2.5, F * 0.0012);
                }
            }

            update(playerX, playerY) {
                if (this.type !== 'sliding') return;                // hinged doors move in stepPhysics; arches don't move
                const cx = this.x + this.w / 2;
                const cy = this.y + this.h / 2;
                const dist = Math.hypot(playerX - cx, playerY - cy);
                const wasOpen = this.targetOpen;
                this.targetOpen = dist < this.triggerRadius || this._actorNear ? 1 : 0;
                // Knocked panels ring back into place
                if (this.jolt || this.joltV) {
                    this.joltV += -0.3 * this.jolt; this.joltV *= 0.72; this.jolt += this.joltV;
                    this.jolt = Math.max(-4, Math.min(4, this.jolt));
                    if (Math.abs(this.jolt) < 0.02 && Math.abs(this.joltV) < 0.02) this.jolt = this.joltV = 0;
                }
                if (this.targetOpen && !wasOpen && typeof ambience !== 'undefined') ambience.doorEvent('whoosh', this);
                this.openAmount += (this.targetOpen - this.openAmount) * this.speed;
                if (this.openAmount < 0.01) this.openAmount = 0;
                if (this.openAmount > 0.99) this.openAmount = 1;
            }

            /** One tick of hinge physics: actors (circles) push the leaf, it pushes back, a spring closes it. */
            stepPhysics(actors) {
                if (this.type === 'sliding') {                              // glass doors open for anyone who comes up to them
                    const cx = this.x + this.w / 2, cy = this.y + this.h / 2, R = this.triggerRadius * 0.85;
                    this._actorNear = false;
                    for (const act of actors) if (act !== (typeof game !== 'undefined' && game.player) && (act.x - cx) ** 2 + (act.y - cy) ** 2 < R * R) { this._actorNear = true; break; }
                    return;
                }
                if (this.type !== 'hinged') return;
                // A leaf folds right back to the wall beside its hinge (not a 90° stop), so no one
                // is ever pinned behind a door flung wide
                const L = this.length, half = this.thickness / 2, MAX = Math.PI - 0.25;
                const a = this.baseAngle + this.angle, ux = Math.cos(a), uy = Math.sin(a);
                for (const act of actors) {
                    const r = act.radius || 12;
                    const px = act.x - this.hx, py = act.y - this.hy;
                    if (px * px + py * py > (L + r + 4) * (L + r + 4)) continue;
                    const s = Math.max(0, Math.min(L, px * ux + py * uy));           // closest point along the leaf
                    const dx = px - ux * s, dy = py - uy * s, dist = Math.hypot(dx, dy);
                    const depth = r + half - dist;
                    if (depth <= 0) continue;
                    let nx, ny;
                    if (dist > 1e-4) { nx = dx / dist; ny = dy / dist; }
                    else { nx = -uy; ny = ux; }
                    const jammed = Math.abs(this.angle) >= MAX - 0.01 && Math.sign(ux * -ny - uy * -nx) === Math.sign(this.angle);
                    const give = jammed || s < 4 ? 1 : 0.7;                         // near the hinge or at the stop it can't yield
                    act.x += nx * depth * give; act.y += ny * depth * give;
                    // Torque from the actor pushing along -n; a push near the hinge still swings the
                    // door (people push a door's middle), so no one gets stuck at the jamb
                    const torque = Math.max(s, L * 0.5) * (ux * -ny - uy * -nx) * depth;
                    this.angVel += torque * 0.9 / (L * L / 3);
                }
                const prev = this.angle;
                this.angVel += -0.018 * this.angle;                                 // closing spring
                this.angVel *= 0.88;
                this.angle += this.angVel;
                if (this.angle > MAX) { this.angle = MAX; this.angVel *= -0.3; }
                if (this.angle < -MAX) { this.angle = -MAX; this.angVel *= -0.3; }
                if (Math.abs(this.angle) < 0.002 && Math.abs(this.angVel) < 0.0005) { this.angle = 0; this.angVel = 0; }
                // Sounds: a creak as it's pushed open, a latch click when it swings home
                if (typeof ambience !== 'undefined') {
                    const t = _frameTime / 1000;
                    this._maxOpen = Math.max(this._maxOpen || 0, Math.abs(this.angle));
                    if (Math.abs(this.angVel) > 0.02 && Math.abs(this.angle) > Math.abs(prev) && t - (this._creakAt || -9) > 0.6) { this._creakAt = t; ambience.doorEvent('creak', this); }
                    if (prev !== 0 && Math.abs(this.angle) < 0.03 && Math.abs(prev) >= 0.03 && this._maxOpen > 0.3) { this._maxOpen = 0; ambience.doorEvent('latch', this); }
                }
                this.openAmount = Math.min(1, Math.abs(this.angle) / (Math.PI / 2));
            }
            
            draw(ctx) {
                ctx.save();
                if (this.type === 'sliding') this.drawSliding(ctx);
                else if (this.type === 'arch') this.drawArch(ctx);
                else this.drawHinged(ctx);
                ctx.restore();
            }
            
            drawSliding(ctx) {
                const slideOffset = this.openAmount * ((this.orientation === 'H' ? this.w : this.h) / 2 + 4);
                if (this.jolt) ctx.translate(this.orientation === 'H' ? 0 : this.jolt, this.orientation === 'H' ? this.jolt : 0);
                
                if (this.orientation === 'H') {
                    const midX = this.x + this.w / 2;
                    ctx.fillStyle = this.color;
                    ctx.fillRect(this.x - slideOffset, this.y, this.w / 2 - 2, this.h);
                    ctx.fillRect(midX + 2 + slideOffset, this.y, this.w / 2 - 2, this.h);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                    ctx.fillRect(this.x - this.w / 2, this.y - 1, this.w * 2, 1);
                    ctx.fillRect(this.x - this.w / 2, this.y + this.h, this.w * 2, 1);
                } else {
                    const midY = this.y + this.h / 2;
                    ctx.fillStyle = this.color;
                    ctx.fillRect(this.x, this.y - slideOffset, this.w, this.h / 2 - 2);
                    ctx.fillRect(this.x, midY + 2 + slideOffset, this.w, this.h / 2 - 2);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                    ctx.fillRect(this.x - 1, this.y - this.h / 2, 1, this.h * 2);
                    ctx.fillRect(this.x + this.w, this.y - this.h / 2, 1, this.h * 2);
                }
            }
            
            /** An open doorway: two stone jambs, a threshold, a gold keystone mark. */
            drawArch(ctx) {
                const H = this.orientation === 'H', len = H ? this.w : this.h, th = H ? this.h : this.w;
                ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
                if (!H) ctx.rotate(Math.PI / 2);
                ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(-len / 2, -th / 2, len, th);          // threshold
                ctx.fillStyle = 'rgba(201,164,106,0.35)'; ctx.fillRect(-len / 2 + 4, -0.5, len - 8, 1);  // brass inlay
                for (const sx of [-1, 1]) {                                                           // jambs
                    ctx.fillStyle = '#2a2230'; ctx.fillRect(sx * len / 2 - 5, -th / 2 - 3, 10, th + 6);
                    ctx.fillStyle = 'rgba(255,230,200,0.10)'; ctx.fillRect(sx * len / 2 - 5, -th / 2 - 3, 10, 1.5);
                }
                ctx.fillStyle = '#c9a46a'; ctx.beginPath();                                            // keystone
                ctx.moveTo(0, -th / 2 - 4); ctx.lineTo(3, -th / 2); ctx.lineTo(0, -th / 2 + 2); ctx.lineTo(-3, -th / 2); ctx.closePath(); ctx.fill();
            }

            drawHinged(ctx) {
                const L = this.length, t = this.thickness;
                ctx.translate(this.hx, this.hy);
                if (Math.abs(this.angle) > 0.17) {                                  // faint sweep on the floor
                    ctx.strokeStyle = 'rgba(255,217,176,0.12)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
                    ctx.beginPath(); ctx.arc(0, 0, L, this.baseAngle, this.baseAngle + this.angle, this.angle < 0); ctx.stroke();
                    ctx.setLineDash([]);
                }
                ctx.rotate(this.baseAngle + this.angle);
                ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(2, -t / 2 + 2, L - 2, t);        // shadow
                ctx.fillStyle = this.color; ctx.fillRect(0, -t / 2, L, t);
                ctx.fillStyle = 'rgba(255,220,190,0.12)'; ctx.fillRect(3, -t / 2 + 1, L - 6, 1.2); // panel sheen
                ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.strokeRect(0, -t / 2, L, t);
                ctx.fillStyle = '#c9a46a';                                           // brass handles on both faces
                ctx.fillRect(L * 0.82, -t / 2 - 2, 5, 2); ctx.fillRect(L * 0.82, t / 2, 5, 2);
                ctx.fillStyle = '#8a7048'; ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, Math.PI * 2); ctx.fill();   // hinge pin
            }
        }
        
        /**
         * SilkLinen — Procedural cloth decoration with wind-driven sway.
         * Renders as semi-transparent bezier curves with soft pooled light beneath.
         */
        class SilkLinen {
            constructor(config) {
                this.x = config.x;
                this.y = config.y;
                this.length = config.length || 80;     // How long the cloth hangs
                this.width = config.width || 30;       // Lateral spread
                this.color = config.color || 'rgba(255, 240, 230, 0.12)';
                this.lightColor = config.lightColor || 'rgba(255, 240, 220, 0.06)';
                this.anchor = config.anchor || 'top';  // Where it's pinned: 'top', 'left', 'right'
                this.phaseOffset = Math.random() * Math.PI * 2;
                this.segments = config.segments || 4;
                
                // Pre-calculate control point offsets for variety
                this._offsets = [];
                for (let i = 0; i < this.segments; i++) {
                    this._offsets.push({
                        freq: 0.8 + Math.random() * 0.6,
                        amp: 0.5 + Math.random() * 0.5,
                        phase: Math.random() * Math.PI * 2
                    });
                }
            }
            
            draw(ctx, wind = 0.3, windDir = 1, time = 0) {
                const t = time + this.phaseOffset;
                
                ctx.save();
                ctx.translate(this.x, this.y);
                
                // Calculate sway for each segment
                const points = [];
                for (let i = 0; i <= this.segments; i++) {
                    const frac = i / this.segments;
                    const off = this._offsets[Math.min(i, this.segments - 1)];
                    
                    let sway = Math.sin(t * off.freq * 2 + off.phase) * wind * this.width * off.amp * frac;
                    sway += Math.sin(t * 1.5 + i) * wind * 5 * frac; // Secondary wobble
                    
                    if (this.anchor === 'top') {
                        points.push({ x: sway * windDir, y: frac * this.length });
                    } else if (this.anchor === 'left') {
                        points.push({ x: frac * this.length, y: sway * windDir });
                    } else {
                        points.push({ x: -frac * this.length, y: sway * windDir });
                    }
                }
                
                // Draw the cloth as layered bezier stripes
                for (let layer = 0; layer < 3; layer++) {
                    const lateralOff = (layer - 1) * (this.width / 4);
                    const alpha = layer === 1 ? 1.0 : 0.5; // Center stripe brighter
                    
                    ctx.globalAlpha = alpha;
                    ctx.strokeStyle = this.color;
                    ctx.lineWidth = this.width / 3;
                    ctx.lineCap = 'round';
                    
                    ctx.beginPath();
                    ctx.moveTo(points[0].x + lateralOff, points[0].y);
                    
                    for (let i = 1; i < points.length; i++) {
                        const prev = points[i - 1];
                        const curr = points[i];
                        const cpx = (prev.x + curr.x) / 2 + lateralOff;
                        const cpy = (prev.y + curr.y) / 2;
                        ctx.quadraticCurveTo(prev.x + lateralOff, prev.y, cpx, cpy);
                    }
                    ctx.stroke();
                }
                
                // Soft light pool beneath the cloth
                const endPt = points[points.length - 1];
                const grad = ctx.createRadialGradient(endPt.x, endPt.y, 2, endPt.x, endPt.y, this.length * 0.5);
                grad.addColorStop(0, this.lightColor);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(endPt.x, endPt.y, this.length * 0.5, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.restore();
            }
        }
        
        /** Where along a moving circle's path (a→b, radius R) it first touches segment c–d: t in 0…1, or null. */
        function sweepSegment(ax, ay, bx, by, cx, cy, dx, dy, R) {
            if (segmentsCross(ax, ay, bx, by, cx, cy, dx, dy)) {
                const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy, den = rx * sy - ry * sx;
                return den ? Math.max(0, Math.min(1, ((cx - ax) * sy - (cy - ay) * sx) / den)) : 0;
            }
            const R2 = R * R;                                    // grazing: the circle touches the leaf at an end of the step
            if (CollisionSystem.distToSegmentSquared(ax, ay, cx, cy, dx, dy) < R2) return 0;
            if (CollisionSystem.distToSegmentSquared(bx, by, cx, cy, dx, dy) < R2) return 1;
            if (CollisionSystem.distToSegmentSquared(cx, cy, ax, ay, bx, by) < R2 || CollisionSystem.distToSegmentSquared(dx, dy, ax, ay, bx, by) < R2) return 0.5;
            return null;
        }

        /** Do segments a–b and c–d cross? */
        function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
            const o = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
            const d1 = o(cx, cy, dx, dy, ax, ay), d2 = o(cx, cy, dx, dy, bx, by);
            const d3 = o(ax, ay, bx, by, cx, cy), d4 = o(ax, ay, bx, by, dx, dy);
            return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
        }

        /**
         * RoomSystem — Manages rooms, doors, windows, and linens for indoor maps.
         * Built once per map load. Tracks which room the player is in.
         */
        class RoomSystem {
            constructor() {
                this.rooms = {};         // { roomId: Room }
                this.doors = [];         // IndoorDoor[]
                this.windows = [];       // IndoorWindow[]
                this.linens = [];        // SilkLinen[]
                this.currentRoom = null; // Room the player is currently in
                this.active = false;     // Whether this map has a room system
            }
            
            /**
             * Build room system from a rooms definition object.
             * @param {object} def - { rooms: {...}, doors: [...], windows: [...], linens: [...] }
             */
            build(def) {
                this.rooms = {};
                this.doors = [];
                this.windows = [];
                this.linens = [];
                this.currentRoom = null;
                this._lastHit = null;           // the lookup cache belongs to the old map's rooms
                
                if (!def) { this.active = false; return; }
                this.active = true;
                
                // Build rooms
                for (const [id, roomDef] of Object.entries(def.rooms || {})) {
                    // One rect, or several (an L-shaped hall); x/y/w/h is then their bounding box
                    const rects = roomDef.rects || [{ x: roomDef.x, y: roomDef.y, w: roomDef.w, h: roomDef.h }];
                    const x0 = Math.min(...rects.map(r => r.x)), y0 = Math.min(...rects.map(r => r.y));
                    const x1 = Math.max(...rects.map(r => r.x + r.w)), y1 = Math.max(...rects.map(r => r.y + r.h));
                    this.rooms[id] = {
                        id,
                        x: x0,
                        y: y0,
                        w: x1 - x0,
                        h: y1 - y0,
                        rects,
                        type: roomDef.type || 'indoor',  // 'indoor' | 'outdoor'
                        label: roomDef.label || id,
                        floorColor: roomDef.floorColor || null,
                        floorTexture: roomDef.floorTexture || null,
                        lightsOff: false, // Stealth: toggled by light switches
                        lightK: 1,        // eased 0…1 light level (switches fade)
                        vis: 1            // eased 0…1 how seen the room is (1 = no veil)
                    };
                }
                this.outdoorness = 0;
                this._lastT = undefined;
                this._veil = null;
                
                // Build doors (each names the two rooms it joins — light spills through it)
                for (const d of (def.doors || [])) {
                    this.doors.push(new IndoorDoor(d));
                    if (!d.rooms || !this.rooms[d.rooms[0]] || !this.rooms[d.rooms[1]])
                        console.warn('[RoomSystem] door at', d.x, d.y, 'joins unknown rooms', d.rooms);
                }
                
                // Build windows
                for (const w of (def.windows || [])) {
                    this.windows.push(new IndoorWindow(w));
                }
                
                // Build linens
                for (const l of (def.linens || [])) {
                    this.linens.push(new SilkLinen(l));
                }
            }
            
            /**
             * Clear the system (called on map change).
             */
            clear() {
                this._lastHit = null;
                this.rooms = {};
                this.doors = [];
                this.windows = [];
                this.linens = [];
                this.currentRoom = null;
                this.active = false;
            }
            
            /**
             * Determine which room the player is in. Returns the room object or null.
             */
            getRoomAt(px, py) {
                const last = this._lastHit;                      // most queries land in the same room
                if (last && RoomSystem.contains(last, px, py)) return last;
                for (const id in this.rooms) {
                    const r = this.rooms[id];
                    if (RoomSystem.contains(r, px, py)) return (this._lastHit = r);
                }
                return null;
            }

            /** Is (px, py) inside room r (any of its rects)? */
            static contains(r, px, py) {
                if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) return false;
                const R = r.rects;
                if (R.length === 1) return true;
                for (let i = 0; i < R.length; i++) { const q = R[i]; if (px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h) return true; }
                return false;
            }
            
            /**
             * Update doors and track player room.
             */
            update(playerX, playerY) {
                if (!this.active) return;
                
                // In a wall gap between rooms, 949 is still where she was
                this.currentRoom = this.getRoomAt(playerX, playerY) || this.currentRoom;
                
                for (const door of this.doors) {
                    door.update(playerX, playerY);
                }
                this._ease();
            }

            /** Ease every room's visibility and light level, and how outside 949 is (time-based). */
            _ease() {
                const now = _frameTime / 1000;
                const dt = this._lastT === undefined ? 1 : Math.min(0.25, Math.max(0, now - this._lastT));
                this._lastT = now;
                const L = ROOM_LOOK, k = rate => 1 - Math.exp(-rate * dt);
                const cur = this.currentRoom, outside = !!(cur && cur.type === 'outdoor');
                // Targets: the room she's in is fully seen; open doors lift the room beyond
                const target = {};
                for (const id in this.rooms) {
                    const r = this.rooms[id];
                    target[id] = r.type === 'outdoor' || r === cur ? 1 : (outside ? L.GLASS_VIS : L.AWAY_VIS);
                }
                if (cur) for (const d of this.doors) {
                    const [a, b] = d.rooms, other = a === cur.id ? b : b === cur.id ? a : null;
                    if (!other || !(other in target) || d.openAmount <= 0) continue;
                    target[other] = Math.max(target[other], target[other] + (1 - target[other]) * d.openAmount * L.DOOR_SPILL);
                }
                const kv = k(L.VIS_RATE), kl = k(L.LIGHT_RATE);
                for (const id in this.rooms) {
                    const r = this.rooms[id];
                    r.vis += (target[id] - r.vis) * kv;
                    r.lightK += ((r.lightsOff ? 0 : 1) - r.lightK) * kl;
                    if (Math.abs(r.lightK - (r.lightsOff ? 0 : 1)) < 0.002) r.lightK = r.lightsOff ? 0 : 1;
                }
                this.outdoorness += ((outside ? 1 : 0) - this.outdoorness) * k(L.OUTDOOR_RATE);
                if (Math.abs(this.outdoorness - (outside ? 1 : 0)) < 0.002) this.outdoorness = outside ? 1 : 0;
            }

            /** Light level (0…1) of a lamp's room — switches fade rather than snap. */
            lampLight(lamp) {
                if (!this.active || !lamp._roomId) return 1;
                const room = this.rooms[lamp._roomId];
                return room ? room.lightK : 1;
            }

            /** Light level at a point (soft lights, glows, props that move). */
            lightAt(x, y) {
                if (!this.active) return 1;
                const r = this.getRoomAt(x, y);
                return r ? r.lightK : 1;
            }
            
            /**
             * Whether the player is currently in an outdoor room segment.
             */
            isPlayerOutdoor() {
                return this.active && this.currentRoom && this.currentRoom.type === 'outdoor';
            }

            /** Hinged-door physics, run from the actor collision pass so doors block and get pushed. */
            stepDoorPhysics(actors) {
                if (!this.active) return;
                for (const door of this.doors) if (door.type !== 'arch') door.stepPhysics(actors);
            }

            /**
             * Does a bullet's path this tick (lastX,lastY → x,y) strike a door? Returns
             * { door, x, y } for the first door hit (and pushes it), else null. Swept, so
             * a sniper round can't skip through a 6 px leaf.
             */
            hitDoors(p) {
                if (!this.active || !this.doors.length) return null;
                const x0 = p.lastX ?? p.x - p.vx, y0 = p.lastY ?? p.y - p.vy, x1 = p.x, y1 = p.y, r = p.radius || 5;
                const mnx = Math.min(x0, x1), mxx = Math.max(x0, x1), mny = Math.min(y0, y1), mxy = Math.max(y0, y1);
                let best = null, bestT = Infinity;
                for (const d of this.doors) {
                    if (d.type === 'arch' || (p._doorHits && p._doorHits.has(d))) continue;
                    const reach = (d.type === 'hinged' ? d.length : 0) + r + 8;
                    if (mxx < d.x - reach || mnx > d.x + d.w + reach || mxy < d.y - reach || mny > d.y + d.h + reach) continue;
                    for (const L of d.leaves()) {
                        const t = sweepSegment(x0, y0, x1, y1, L[0], L[1], L[2], L[3], r + d.halfThick);
                        if (t !== null && t < bestT) { bestT = t; best = d; }
                    }
                }
                if (!best) return null;
                const ix = x0 + (x1 - x0) * bestT, iy = y0 + (y1 - y0) * bestT;
                best.strike(p, ix, iy);
                (p._doorHits || (p._doorHits = new Set())).add(best);
                return { door: best, x: ix, y: iy };
            }

            /** Does a closed door stand across this line of sight? (Doors that are mostly open don't.) */
            doorBlocks(x1, y1, x2, y2) {
                if (!this.active) return false;
                for (const d of this.doors) {
                    if (d.type === 'arch' || d.openAmount >= 0.3) continue;
                    for (const L of d.leaves()) if (segmentsCross(x1, y1, x2, y2, L[0], L[1], L[2], L[3])) return true;
                }
                return false;
            }
            
            /**
             * Toggle lights on/off for a specific room.
             */
            toggleRoomLights(roomId) {
                const room = this.rooms[roomId];
                if (room) {
                    room.lightsOff = !room.lightsOff;
                    return room.lightsOff; // true = lights are now OFF
                }
                return false;
            }
            
            /**
             * Get room ID for a world position. Returns null if not in any room.
             */
            getRoomIdAt(x, y) {
                const r = this.getRoomAt(x, y);
                return r ? r.id : null;
            }
            
            /**
             * Auto-tag an array of lamps with their containing room ID.
             * Called once after lamps are loaded.
             */
            tagLamps(lamps) {
                if (!this.active) return;
                for (const lamp of lamps) {
                    lamp._roomId = this.getRoomIdAt(lamp.x, lamp.y);
                    if (!lamp._roomId) console.warn('[RoomSystem] lamp outside every room at', lamp.x, lamp.y);
                }
            }
            
            /**
             * Check if a lamp's room has lights turned off.
             */
            isLampRoomDark(lamp) {
                if (!this.active || !lamp._roomId) return false;
                const room = this.rooms[lamp._roomId];
                return room ? room.lightK < 0.01 : false;
            }
            
            // ================================================================
            //  AUTO WALL CUTTER — Splits walls wherever doors are placed.
            //  Call BEFORE the map's walls are used for collision/rendering.
            //  Returns a new walls array with gaps cut for every door.
            // ================================================================
            static cutWallsForDoors(walls, doors) {
                if (!doors || doors.length === 0) return walls;
                
                let result = [...walls];
                
                for (const door of doors) {
                    const newWalls = [];
                    
                    for (const w of result) {
                        const cut = RoomSystem._tryCutWall(w, door);
                        if (cut) {
                            // Wall was split — add the segments (may be 0, 1, or 2 pieces)
                            newWalls.push(...cut);
                        } else {
                            // No overlap — keep wall as-is
                            newWalls.push(w);
                        }
                    }
                    
                    result = newWalls;
                }
                
                return result;
            }
            
            /**
             * Try to cut a single wall for a single door.
             * Returns null if no overlap, or an array of 0-2 wall segments.
             */
            static _tryCutWall(wall, door) {
                const GAP_MARGIN = 2; // Extra pixels of clearance on each side
                
                // Determine door bounds
                const dx = door.x;
                const dy = door.y;
                const dw = door.w || 60;
                const dh = door.h || 8;
                
                // Check if wall and door overlap
                if (wall.x + wall.w <= dx || wall.x >= dx + dw ||
                    wall.y + wall.h <= dy || wall.y >= dy + dh) {
                    return null; // No overlap
                }
                
                // Determine if this is primarily a horizontal or vertical wall
                const isHorizontalWall = wall.w > wall.h;
                
                const segments = [];
                
                if (isHorizontalWall) {
                    // Cut horizontally — door creates a gap in X range
                    const gapLeft = dx - GAP_MARGIN;
                    const gapRight = dx + dw + GAP_MARGIN;
                    
                    // Left segment
                    if (gapLeft > wall.x + 2) {
                        segments.push({ x: wall.x, y: wall.y, w: gapLeft - wall.x, h: wall.h });
                    }
                    // Right segment
                    if (gapRight < wall.x + wall.w - 2) {
                        segments.push({ x: gapRight, y: wall.y, w: (wall.x + wall.w) - gapRight, h: wall.h });
                    }
                } else {
                    // Cut vertically — door creates a gap in Y range
                    const gapTop = dy - GAP_MARGIN;
                    const gapBottom = dy + dh + GAP_MARGIN;
                    
                    // Top segment
                    if (gapTop > wall.y + 2) {
                        segments.push({ x: wall.x, y: wall.y, w: wall.w, h: gapTop - wall.y });
                    }
                    // Bottom segment
                    if (gapBottom < wall.y + wall.h - 2) {
                        segments.push({ x: wall.x, y: gapBottom, w: wall.w, h: (wall.y + wall.h) - gapBottom });
                    }
                }
                
                return segments;
            }
            
            // ================================================================
            //  THE VEIL — rooms 949 isn't in sit in a soft violet shadow, feathered
            //  at the edges (drawn small, then scaled up smoothly), eased per room.
            //  On a dark map it goes into the light layer (dimming the lamp pools) before
            //  the light's colour — so the lamps still glow through it; in bright light,
            //  over the scene.
            // ================================================================
            drawVeil(ctx, alpha = 1) {
                if (!this.active) return;
                const L = ROOM_LOOK;
                let any = false;
                for (const id in this.rooms) if (this.rooms[id].vis < 0.995) { any = true; break; }
                if (!any) return;
                if (!this._veil) {                                      // world-aligned, one texel per FEATHER px
                    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
                    for (const id in this.rooms) { const r = this.rooms[id]; x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
                    const pad = L.FEATHER * 2, cv = document.createElement('canvas');
                    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
                    cv.width = Math.ceil((x1 - x0) / L.FEATHER); cv.height = Math.ceil((y1 - y0) / L.FEATHER);
                    this._veil = { cv, c: cv.getContext('2d'), x0, y0, w: cv.width * L.FEATHER, h: cv.height * L.FEATHER };
                }
                const V = this._veil, c = V.c, s = 1 / L.FEATHER;
                c.clearRect(0, 0, V.cv.width, V.cv.height);
                let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;   // only the veiled part is stamped
                for (const id in this.rooms) {
                    const r = this.rooms[id], a = Math.min(1, (1 - r.vis) * L.VEIL_MAX);
                    if (a < 0.004) continue;
                    c.fillStyle = `rgba(${L.VEIL_RGB}, ${a.toFixed(3)})`;
                    for (const q of r.rects) c.fillRect((q.x - V.x0) * s, (q.y - V.y0) * s, q.w * s, q.h * s);
                    bx0 = Math.min(bx0, r.x); by0 = Math.min(by0, r.y); bx1 = Math.max(bx1, r.x + r.w); by1 = Math.max(by1, r.y + r.h);
                }
                if (bx0 === Infinity) return;
                // Source rect in texels (padded by the feather), snapped to whole texels
                const tx0 = Math.max(0, Math.floor((bx0 - V.x0) * s) - 2), ty0 = Math.max(0, Math.floor((by0 - V.y0) * s) - 2);
                const tx1 = Math.min(V.cv.width, Math.ceil((bx1 - V.x0) * s) + 2), ty1 = Math.min(V.cv.height, Math.ceil((by1 - V.y0) * s) + 2);
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(V.cv, tx0, ty0, tx1 - tx0, ty1 - ty0, V.x0 + tx0 * L.FEATHER, V.y0 + ty0 * L.FEATHER, (tx1 - tx0) * L.FEATHER, (ty1 - ty0) * L.FEATHER);
                ctx.restore();
            }

            /** Old name, kept for callers. */
            drawRoofOcclusion(ctx) { this.drawVeil(ctx); }

            /**
             * Outdoor rooms carry the sky's light: on the light layer (darkness `ambient`),
             * thin the darkness over each outdoor room down to the outdoor sky's `skyDark`.
             */
            carveSkyLight(lightCtx, ambient, skyDark) {
                if (!this.active || ambient <= 0) return;
                const a = 1 - Math.min(1, skyDark / ambient);
                if (a < 0.01) return;
                lightCtx.save();
                lightCtx.globalCompositeOperation = 'destination-out';
                lightCtx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
                for (const id in this.rooms) { const r = this.rooms[id]; if (r.type === 'outdoor') for (const q of r.rects) lightCtx.fillRect(q.x, q.y, q.w, q.h); }
                lightCtx.restore();
            }
            
            /**
             * Draw room floors (optional override colors), doors, windows, linens.
             * Called during the world geometry pass.
             */
            drawFloors(ctx) {
                if (!this.active) return;
                
                for (const id in this.rooms) {
                    const r = this.rooms[id];
                    if (!r.floorColor) continue;
                    ctx.fillStyle = r.floorColor;
                    for (const q of r.rects) ctx.fillRect(q.x, q.y, q.w, q.h);
                }
            }
            
            drawDoors(ctx) {
                for (const door of this.doors) {
                    door.draw(ctx);
                }
            }
            
            drawWindows(ctx, daylight) {
                for (const win of this.windows) {
                    win.draw(ctx, daylight);
                }
            }
            
            drawLinens(ctx, wind, windDir, time) {
                for (const linen of this.linens) {
                    linen.draw(ctx, wind, windDir, time);
                }
            }
            
            /**
             * Draw window light projections on the lighting layer.
             * Called during destination-out pass (cuts light holes).
             */
            drawWindowLightProjections(lightCtx, daylight) {
                for (const win of this.windows) {
                    win.drawLightProjection(lightCtx, daylight);
                }
            }
            
            /**
             * Draw window color pass on the lighting layer.
             * Called during lighter blend pass.
             */
            drawWindowColorPass(lightCtx, daylight) {
                for (const win of this.windows) {
                    win.drawColorProjection(lightCtx, daylight);
                }
            }
        }
        
        // ============================================================================
        //  ROOM DEFINITIONS — Per-map room layouts
        //  These are static definitions passed to RoomSystem.build() during loadMap.
        // ============================================================================
        
        const ROOM_DEFS = {
            'apt_949': {
                rooms: {
                    veranda:    { x: 0,   y: 0,   w: 1400, h: 200, type: 'outdoor', label: 'Veranda' },
                    main_room:  { x: 8,   y: 208, w: 892,  h: 684, type: 'indoor',  label: 'Living Room' },
                    bedroom:    { x: 908,  y: 208, w: 484,  h: 340, type: 'indoor',  label: 'Bedroom' },
                    bathroom:   { x: 908,  y: 556, w: 484,  h: 336, type: 'indoor',  label: 'Bathroom' }
                },
                doors: [
                    // Veranda → Main room: 3 sliding glass doors across the veranda wall (y:200)
                    { x: 150,  y: 200, w: 120, h: 8, type: 'sliding', orientation: 'H', rooms: ['veranda', 'main_room'], color: 'rgba(150, 200, 220, 0.25)', speed: 0.06, triggerRadius: 90 },
                    { x: 500,  y: 200, w: 120, h: 8, type: 'sliding', orientation: 'H', rooms: ['veranda', 'main_room'], color: 'rgba(150, 200, 220, 0.25)', speed: 0.06, triggerRadius: 90 },
                    { x: 800,  y: 200, w: 120, h: 8, type: 'sliding', orientation: 'H', rooms: ['veranda', 'main_room'], color: 'rgba(150, 200, 220, 0.25)', speed: 0.06, triggerRadius: 90 },
                    // Main room → Bedroom: hinged door in vertical divider (x:900)
                    { x: 900, y: 320, w: 8, h: 70, type: 'hinged', orientation: 'V', rooms: ['main_room', 'bedroom'], color: '#4a3a30', hingeSide: 'left', triggerRadius: 60 },
                    // Bedroom → Bathroom: hinged door in horizontal divider (y:548)
                    { x: 1050, y: 548, w: 70, h: 8, type: 'hinged', orientation: 'H', rooms: ['bedroom', 'bathroom'], color: '#4a3a30', hingeSide: 'left', triggerRadius: 60 },
                ],
                windows: [
                    // Veranda wall (y:200) — segmented windows between sliding door gaps
                    // The auto-cutter leaves wall segments between doors; these windows fill in
                    { x: 30,   y: 200, w: 110, h: 8, facing: 'S', projectionLength: 100, tint: '200, 220, 255' },
                    { x: 280,  y: 200, w: 210, h: 8, facing: 'S', projectionLength: 100, tint: '200, 220, 255' },
                    { x: 630,  y: 200, w: 160, h: 8, facing: 'S', projectionLength: 100, tint: '200, 220, 255' },
                    { x: 930,  y: 200, w: 460, h: 8, facing: 'S', projectionLength: 100, tint: '200, 220, 255' },
                    // Left exterior wall
                    { x: 0, y: 400, w: 8, h: 60, facing: 'E', projectionLength: 80 },
                    { x: 0, y: 650, w: 8, h: 60, facing: 'E', projectionLength: 80 },
                    // Right exterior wall  
                    { x: 1392, y: 350, w: 8, h: 60, facing: 'W', projectionLength: 80 },
                    { x: 1392, y: 700, w: 8, h: 60, facing: 'W', projectionLength: 80 },
                    // Veranda open-air edges (bright sky)
                    { x: 200,  y: 0, w: 300, h: 6, facing: 'S', projectionLength: 50, tint: '180, 210, 255' },
                    { x: 800,  y: 0, w: 300, h: 6, facing: 'S', projectionLength: 50, tint: '180, 210, 255' },
                ],
                linens: [
                    // Sheer curtains flanking each sliding door on the veranda wall
                    { x: 145, y: 195, length: 100, width: 18, anchor: 'top', color: 'rgba(255, 245, 235, 0.09)', lightColor: 'rgba(255, 240, 220, 0.03)', segments: 5 },
                    { x: 275, y: 195, length: 100, width: 18, anchor: 'top', color: 'rgba(255, 245, 235, 0.09)', lightColor: 'rgba(255, 240, 220, 0.03)', segments: 5 },
                    { x: 495, y: 195, length: 110, width: 20, anchor: 'top', color: 'rgba(240, 230, 225, 0.08)', lightColor: 'rgba(255, 235, 215, 0.03)', segments: 5 },
                    { x: 625, y: 195, length: 110, width: 20, anchor: 'top', color: 'rgba(240, 230, 225, 0.08)', lightColor: 'rgba(255, 235, 215, 0.03)', segments: 5 },
                    { x: 795, y: 195, length: 105, width: 16, anchor: 'top', color: 'rgba(255, 240, 240, 0.07)', lightColor: 'rgba(255, 220, 200, 0.03)', segments: 4 },
                    { x: 925, y: 195, length: 105, width: 16, anchor: 'top', color: 'rgba(255, 240, 240, 0.07)', lightColor: 'rgba(255, 220, 200, 0.03)', segments: 4 },
                    // Bedroom drape near window
                    { x: 1388, y: 340, length: 75, width: 12, anchor: 'top', color: 'rgba(220, 200, 230, 0.08)', lightColor: 'rgba(200, 180, 220, 0.03)', segments: 3 }
                ]
            },
            // ── The rest of the indoor maps ─────────────────────────────────────────
            // Penthouse suite (hotel): the living room opens west–east through a wide arch;
            // a lounge wraps the bathroom (L-shaped); glass doors onto the balcony.
            'hotel_suite': {
                rooms: {
                    living:   { x: 50,   y: 50,  w: 650, h: 900, type: 'indoor',  label: 'Living Room' },
                    lounge:   { rects: [{ x: 720, y: 50, w: 380, h: 750 }, { x: 1100, y: 320, w: 250, h: 480 }], type: 'indoor', label: 'Master Bedroom' },
                    bathroom: { x: 1120, y: 50,  w: 230, h: 250, type: 'indoor',  label: 'Bathroom' },
                    balcony:  { x: 720,  y: 810, w: 630, h: 190, type: 'outdoor', label: 'Balcony' }
                },
                doors: [
                    { x: 700, y: 300, w: 20, h: 200, type: 'arch', orientation: 'V', rooms: ['living', 'lounge'] },
                    { x: 1255, y: 300, w: 90, h: 20, type: 'hinged', orientation: 'H', rooms: ['lounge', 'bathroom'], color: '#2a1a24', hingeSide: 'left', triggerRadius: 60 },   // black lacquer
                    { x: 1000, y: 800, w: 150, h: 10, type: 'sliding', orientation: 'H', rooms: ['lounge', 'balcony'], color: 'rgba(200, 190, 255, 0.28)', speed: 0.06, triggerRadius: 100 },
                ],
                windows: [
                    { x: 720, y: 800, w: 270, h: 10, facing: 'N', projectionLength: 110, tint: '200, 220, 255' },   // glass onto the balcony
                    { x: 1160, y: 800, w: 190, h: 10, facing: 'N', projectionLength: 110, tint: '200, 220, 255' },
                    { x: 250, y: 0, w: 200, h: 50, facing: 'S', projectionLength: 120, tint: '190, 170, 255' },
                ]
            },
            // Cozy café: the floor wraps round the kitchen (north-east) and the storeroom (south-east),
            // each now behind a door — the kitchen used to be sealed, Chef Koda out of reach.
            'cozy_cafe_interior': {
                rooms: {
                    cafe:      { rects: [{ x: 0, y: 0, w: 690, h: 315 }, { x: 0, y: 315, w: 1200, h: 385 }, { x: 0, y: 700, w: 940, h: 300 }], type: 'indoor', label: 'Café' },
                    kitchen:   { x: 705, y: 0,   w: 495, h: 300, type: 'indoor', label: 'Kitchen' },
                    storeroom: { x: 955, y: 715, w: 245, h: 285, type: 'indoor', label: 'Storeroom' }
                },
                doors: [
                    { x: 760, y: 300, w: 80, h: 15, type: 'hinged', orientation: 'H', rooms: ['cafe', 'kitchen'], color: '#5d3a1a', hingeSide: 'left', triggerRadius: 60 },
                    { x: 940, y: 790, w: 15, h: 80, type: 'hinged', orientation: 'V', rooms: ['cafe', 'storeroom'], color: '#4a3020', hingeSide: 'left', triggerRadius: 60 },
                ]
            },
            // Torque Auto: the bay, the showroom through an open bay door, the parts room behind its own door.
            'auto_shop': {
                rooms: {
                    bay:      { x: 0,   y: 0,   w: 880, h: 1000, type: 'indoor', label: 'Service Bay' },
                    showroom: { x: 900, y: 0,   w: 500, h: 690,  type: 'indoor', label: 'Showroom' },
                    parts:    { x: 900, y: 710, w: 500, h: 290,  type: 'indoor', label: 'Parts Room' }
                },
                doors: [
                    { x: 880, y: 330, w: 20, h: 100, type: 'arch', orientation: 'V', rooms: ['bay', 'showroom'] },
                    { x: 880, y: 790, w: 20, h: 80, type: 'hinged', orientation: 'V', rooms: ['bay', 'parts'], color: '#555a60', hingeSide: 'left', triggerRadius: 60 },
                ]
            },
            // Enni Cole: couture (west) and accessories (east) wings off the atrium — glass doors
            // midway, and wide open at the front by the checkout.
            'enni_cole_interior': {
                rooms: {
                    couture:     { x: 0,    y: 0, w: 440, h: 1400, type: 'indoor', label: 'Couture' },
                    atrium:      { x: 460,  y: 0, w: 1080, h: 1400, type: 'indoor', label: 'Atrium' },
                    accessories: { x: 1560, y: 0, w: 440, h: 1400, type: 'indoor', label: 'Accessories' }
                },
                doors: [
                    { x: 440, y: 640, w: 20, h: 120, type: 'sliding', orientation: 'V', rooms: ['couture', 'atrium'], color: 'rgba(230, 200, 255, 0.25)', speed: 0.06, triggerRadius: 100 },
                    { x: 1540, y: 640, w: 20, h: 120, type: 'sliding', orientation: 'V', rooms: ['atrium', 'accessories'], color: 'rgba(230, 200, 255, 0.25)', speed: 0.06, triggerRadius: 100 },
                    { x: 440, y: 1160, w: 20, h: 190, type: 'arch', orientation: 'V', rooms: ['couture', 'atrium'] },
                    { x: 1540, y: 1160, w: 20, h: 190, type: 'arch', orientation: 'V', rooms: ['atrium', 'accessories'] },
                ]
            },
            // Neural Systems: the showroom, a small foyer at the door, the consultation and server rooms off it.
            'neural_sys_interior': {
                rooms: {
                    showroom: { x: 0,   y: 0,   w: 1000, h: 550, type: 'indoor', label: 'Showroom' },
                    foyer:    { x: 415, y: 565, w: 170,  h: 235, type: 'indoor', label: 'Foyer' },
                    consult:  { x: 0,   y: 565, w: 400,  h: 235, type: 'indoor', label: 'Consultation' },
                    server:   { x: 600, y: 565, w: 400,  h: 235, type: 'indoor', label: 'Server Room' }
                },
                doors: [
                    { x: 415, y: 550, w: 170, h: 15, type: 'arch', orientation: 'H', rooms: ['showroom', 'foyer'] },
                    { x: 400, y: 630, w: 15, h: 70, type: 'hinged', orientation: 'V', rooms: ['foyer', 'consult'], color: '#2a2a50', hingeSide: 'left', triggerRadius: 60 },
                    { x: 585, y: 630, w: 15, h: 70, type: 'hinged', orientation: 'V', rooms: ['foyer', 'server'], color: '#2a2a50', hingeSide: 'right', triggerRadius: 60 },
                ]
            },
            // One-room interiors: no veil to draw, but they share the room lighting (eased lamps,
            // lightAt), and any doors they gain later take bullets and block sight.
            'hotel_lobby':         { rooms: { lobby: { x: 0, y: 0, w: 1000, h: 1200, type: 'indoor', label: 'Lobby' } } },
            'medbay_sw':           { rooms: { clinic: { x: 0, y: 0, w: 800, h: 800, type: 'indoor', label: 'Clinic' } } },
            'ollo_interior':       { rooms: { shop: { x: 0, y: 0, w: 800, h: 600, type: 'indoor', label: 'Shop' } } },
            // Moon City Nightclub: the hall and its bar, powder room and gents off the bar, the foyer,
            // and the VIP wing (a curtained corridor, three suites, Mirabel's lounge at its head).
            'moon_city_nightclub': (() => {
                const LACQUER = '#3a1e4a', VELVET = 'rgba(150, 30, 80, 0.62)';
                const hinged = (x, y, rooms, hingeSide) => ({ x, y, w: 14, h: 80, type: 'hinged', orientation: 'V', rooms, color: LACQUER, hingeSide, triggerRadius: 60 });
                const curtain = (y, rooms) => ({ x: 1330, y, w: 14, h: 90, type: 'sliding', orientation: 'V', rooms, color: VELVET, speed: 0.06, triggerRadius: 80 });
                return {
                    rooms: {
                        powder:   { x: 14,   y: 14,   w: 346, h: 546,  type: 'indoor', label: 'Powder Room' },
                        gents:    { x: 14,   y: 574,  w: 346, h: 612,  type: 'indoor', label: 'Gents' },
                        hall:     { x: 374,  y: 14,   w: 852, h: 972,  type: 'indoor', label: 'The Floor' },
                        foyer:    { x: 374,  y: 1000, w: 852, h: 186,  type: 'indoor', label: 'Foyer' },
                        lounge:   { x: 1240, y: 14,   w: 346, h: 262,  type: 'indoor', label: "Mirabel's Lounge" },
                        corridor: { x: 1240, y: 290,  w: 90,  h: 896,  type: 'indoor', label: 'VIP' },
                        suite1:   { x: 1344, y: 290,  w: 242, h: 290,  type: 'indoor', label: 'Suite I' },
                        suite2:   { x: 1344, y: 594,  w: 242, h: 290,  type: 'indoor', label: 'Suite II' },
                        suite3:   { x: 1344, y: 898,  w: 242, h: 288,  type: 'indoor', label: 'Suite III' }
                    },
                    doors: [
                        { x: 730, y: 986, w: 140, h: 14, type: 'arch', orientation: 'H', rooms: ['foyer', 'hall'] },
                        hinged(360, 90, ['powder', 'hall'], 'left'),
                        hinged(360, 880, ['gents', 'hall'], 'right'),
                        { x: 1226, y: 560, w: 14, h: 120, type: 'arch', orientation: 'V', rooms: ['hall', 'corridor'] },
                        { x: 1240, y: 276, w: 90, h: 14, type: 'arch', orientation: 'H', rooms: ['corridor', 'lounge'] },
                        curtain(390, ['corridor', 'suite1']), curtain(694, ['corridor', 'suite2']), curtain(1000, ['corridor', 'suite3']),
                    ],
                    linens: [
                        // Velvet drapes hung either side of the way into the VIP wing
                        { x: 1222, y: 546, length: 50, width: 12, anchor: 'right', color: 'rgba(150, 30, 80, 0.2)', lightColor: 'rgba(255, 120, 170, 0.04)', segments: 3 },
                        { x: 1222, y: 694, length: 50, width: 12, anchor: 'right', color: 'rgba(150, 30, 80, 0.2)', lightColor: 'rgba(255, 120, 170, 0.04)', segments: 3 },
                    ]
                };
            })(),
            // The House of Death (gauntlet). Three loops round the grand hall, so no one gets cornered:
            // foyer–kitchen–dining–hall, foyer–gallery–courtyard–hall, dining–library–chapel–bedroom–courtyard.
            'house_of_death': (() => {
                const WOOD = '#6b3a45', GLASS = 'rgba(170, 150, 230, 0.32)';   // oxblood leaves (light enough to read), violet glass
                const hinged = (x, y, o, rooms, hingeSide = 'left') => ({ x, y, w: o === 'V' ? 14 : 80, h: o === 'V' ? 80 : 14, type: 'hinged', orientation: o, rooms, color: WOOD, hingeSide, triggerRadius: 60 });
                const slide = (x, y, o, rooms) => ({ x, y, w: o === 'V' ? 14 : 120, h: o === 'V' ? 120 : 14, type: 'sliding', orientation: o, rooms, color: GLASS, speed: 0.07, triggerRadius: 90 });
                const STAINED_V = '190, 130, 255', STAINED_R = '255, 120, 170';
                return {
                    rooms: {
                        library:   { x: 14,   y: 14,   w: 546, h: 416, type: 'indoor',  label: 'Library' },
                        chapel:    { x: 574,  y: 14,   w: 652, h: 416, type: 'indoor',  label: 'Chapel' },
                        bedroom:   { x: 1240, y: 14,   w: 320, h: 416, type: 'indoor',  label: 'Master Bedroom' },
                        bath:      { x: 1574, y: 14,   w: 212, h: 416, type: 'indoor',  label: 'Bath' },
                        dining:    { x: 14,   y: 444,  w: 546, h: 556, type: 'indoor',  label: 'Dining Room' },
                        hall:      { x: 574,  y: 444,  w: 652, h: 556, type: 'indoor',  label: 'Grand Hall' },
                        courtyard: { x: 1240, y: 444,  w: 546, h: 556, type: 'outdoor', label: 'Rain Courtyard' },
                        kitchen:   { x: 14,   y: 1014, w: 546, h: 472, type: 'indoor',  label: 'Kitchen' },
                        foyer:     { x: 574,  y: 1014, w: 652, h: 486, type: 'indoor',  label: 'Foyer' },
                        gallery:   { rects: [{ x: 1240, y: 1014, w: 546, h: 150 }, { x: 1636, y: 1164, w: 150, h: 322 }], type: 'indoor', label: 'Gallery' },
                        reliquary: { x: 1240, y: 1178, w: 382, h: 308, type: 'indoor',  label: 'Reliquary' }
                    },
                    doors: [
                        { x: 820, y: 1000, w: 160, h: 14, type: 'arch', orientation: 'H', rooms: ['foyer', 'hall'] },
                        hinged(560, 1210, 'V', ['foyer', 'kitchen']),
                        hinged(1226, 1060, 'V', ['foyer', 'gallery'], 'right'),
                        hinged(1226, 1340, 'V', ['foyer', 'reliquary']),
                        hinged(1622, 1300, 'V', ['reliquary', 'gallery'], 'right'),
                        { x: 180, y: 1000, w: 150, h: 14, type: 'arch', orientation: 'H', rooms: ['kitchen', 'dining'] },
                        hinged(560, 680, 'V', ['dining', 'hall']),
                        hinged(240, 430, 'H', ['dining', 'library']),
                        hinged(560, 200, 'V', ['library', 'chapel'], 'right'),
                        // The chapel's double doors onto the grand hall
                        { ...hinged(830, 430, 'H', ['chapel', 'hall'], 'left'), w: 70 },
                        { ...hinged(900, 430, 'H', ['chapel', 'hall'], 'right'), w: 70 },
                        hinged(1226, 200, 'V', ['chapel', 'bedroom']),
                        { ...hinged(1560, 250, 'V', ['bedroom', 'bath']), h: 70 },
                        slide(1340, 430, 'H', ['bedroom', 'courtyard']),
                        slide(1226, 660, 'V', ['hall', 'courtyard']),
                        slide(1450, 1000, 'H', ['courtyard', 'gallery']),
                    ],
                    windows: [
                        // Lancet windows of stained glass: violet and rose (facing = the way the light falls)
                        { x: 640, y: 0, w: 60, h: 14, facing: 'S', projectionLength: 150, tint: STAINED_V },
                        { x: 870, y: 0, w: 60, h: 14, facing: 'S', projectionLength: 170, tint: STAINED_R },
                        { x: 1100, y: 0, w: 60, h: 14, facing: 'S', projectionLength: 150, tint: STAINED_V },
                        { x: 0, y: 150, w: 14, h: 60, facing: 'E', projectionLength: 120, tint: STAINED_R },
                        { x: 0, y: 650, w: 14, h: 60, facing: 'E', projectionLength: 120, tint: STAINED_V },
                        { x: 1330, y: 0, w: 70, h: 14, facing: 'S', projectionLength: 120, tint: STAINED_R },
                        { x: 1786, y: 150, w: 14, h: 70, facing: 'W', projectionLength: 110, tint: '220, 230, 255' },
                        // Glass walls onto the courtyard
                        { x: 1260, y: 430, w: 70, h: 14, facing: 'N', projectionLength: 90, tint: '200, 210, 255' },
                        { x: 1226, y: 480, w: 14, h: 160, facing: 'W', projectionLength: 110, tint: '200, 210, 255' },
                        { x: 1226, y: 800, w: 14, h: 170, facing: 'W', projectionLength: 110, tint: '200, 210, 255' },
                        { x: 1260, y: 1000, w: 170, h: 14, facing: 'S', projectionLength: 90, tint: '200, 210, 255' },
                        { x: 1786, y: 1260, w: 14, h: 80, facing: 'W', projectionLength: 110, tint: STAINED_V },
                    ],
                    linens: [
                        // Velvet drapes by the chapel lancets and the hall's glass wall
                        { x: 632, y: 16, length: 70, width: 14, anchor: 'top', color: 'rgba(120, 40, 90, 0.16)', lightColor: 'rgba(190, 120, 255, 0.03)', segments: 4 },
                        { x: 1168, y: 16, length: 70, width: 14, anchor: 'top', color: 'rgba(120, 40, 90, 0.16)', lightColor: 'rgba(190, 120, 255, 0.03)', segments: 4 },
                        { x: 1222, y: 470, length: 60, width: 12, anchor: 'right', color: 'rgba(90, 30, 70, 0.16)', lightColor: 'rgba(255, 120, 170, 0.03)', segments: 3 },
                        { x: 1222, y: 950, length: 60, width: 12, anchor: 'right', color: 'rgba(90, 30, 70, 0.16)', lightColor: 'rgba(255, 120, 170, 0.03)', segments: 3 },
                    ]
                };
            })()
        };

