        // ============================================================================
        //  ROOM SYSTEM — Indoor V2 Architecture
        //  Gives indoor maps the same depth as outdoor: rooms, doors, windows, linens.
        //  Each room carries its own type (indoor/outdoor) enabling per-room weather,
        //  daylight projection through windows, and door animations.
        // ============================================================================
        
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
            }

            update(playerX, playerY) {
                if (this.type === 'hinged') return;                 // hinged doors move in stepPhysics
                const cx = this.x + this.w / 2;
                const cy = this.y + this.h / 2;
                const dist = Math.hypot(playerX - cx, playerY - cy);
                const wasOpen = this.targetOpen;
                this.targetOpen = dist < this.triggerRadius ? 1 : 0;
                if (this.targetOpen && !wasOpen && typeof ambience !== 'undefined') ambience.doorEvent('whoosh', this);
                this.openAmount += (this.targetOpen - this.openAmount) * this.speed;
                if (this.openAmount < 0.01) this.openAmount = 0;
                if (this.openAmount > 0.99) this.openAmount = 1;
            }

            /** One tick of hinge physics: actors (circles) push the leaf, it pushes back, a spring closes it. */
            stepPhysics(actors) {
                if (this.type !== 'hinged') return;
                const L = this.length, half = this.thickness / 2, MAX = Math.PI / 2 - 0.05;
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
                    // Torque from the actor pushing along -n at distance s from the hinge
                    const torque = s * (ux * -ny - uy * -nx) * depth;
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
                this.openAmount = Math.abs(this.angle) / (Math.PI / 2);
            }
            
            draw(ctx) {
                ctx.save();
                if (this.type === 'sliding') this.drawSliding(ctx);
                else this.drawHinged(ctx);
                ctx.restore();
            }
            
            drawSliding(ctx) {
                const slideOffset = this.openAmount * (this.w / 2 + 4);
                
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
                
                if (!def) { this.active = false; return; }
                this.active = true;
                
                // Build rooms
                for (const [id, roomDef] of Object.entries(def.rooms || {})) {
                    this.rooms[id] = {
                        id,
                        x: roomDef.x,
                        y: roomDef.y,
                        w: roomDef.w,
                        h: roomDef.h,
                        type: roomDef.type || 'indoor',  // 'indoor' | 'outdoor'
                        label: roomDef.label || id,
                        floorColor: roomDef.floorColor || null,
                        floorTexture: roomDef.floorTexture || null,
                        lightsOff: false  // Stealth: toggled by light switches
                    };
                }
                
                // Build doors
                for (const d of (def.doors || [])) {
                    this.doors.push(new IndoorDoor(d));
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
                for (const id in this.rooms) {
                    const r = this.rooms[id];
                    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
                        return r;
                    }
                }
                return null;
            }
            
            /**
             * Update doors and track player room.
             */
            update(playerX, playerY) {
                if (!this.active) return;
                
                this.currentRoom = this.getRoomAt(playerX, playerY);
                
                for (const door of this.doors) {
                    door.update(playerX, playerY);
                }
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
                for (const door of this.doors) if (door.type === 'hinged') door.stepPhysics(actors);
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
                for (const id in this.rooms) {
                    const r = this.rooms[id];
                    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                        return id;
                    }
                }
                return null;
            }
            
            /**
             * Auto-tag an array of lamps with their containing room ID.
             * Called once after lamps are loaded.
             */
            tagLamps(lamps) {
                if (!this.active) return;
                for (const lamp of lamps) {
                    lamp._roomId = this.getRoomIdAt(lamp.x, lamp.y);
                }
            }
            
            /**
             * Check if a lamp's room has lights turned off.
             */
            isLampRoomDark(lamp) {
                if (!this.active || !lamp._roomId) return false;
                const room = this.rooms[lamp._roomId];
                return room ? room.lightsOff : false;
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
            //  ROOF OCCLUSION — Draw a roof layer over indoor rooms
            //  when the player is in an outdoor segment (like a balcony).
            //  Fades in/out smoothly.
            // ================================================================
            drawRoofOcclusion(ctx) {
                if (!this.active) return;
                
                // Target opacity based on player being outdoors
                const targetRoof = this.isPlayerOutdoor() ? 0.95 : 0;
                if (this._roofOpacity === undefined) this._roofOpacity = 0;
                this._roofOpacity += (targetRoof - this._roofOpacity) * 0.06;
                
                if (this._roofOpacity < 0.01) return;
                
                ctx.globalAlpha = this._roofOpacity;
                ctx.fillStyle = '#0a0610';
                
                for (const id in this.rooms) {
                    const r = this.rooms[id];
                    if (r.type !== 'outdoor') {
                        ctx.fillRect(r.x, r.y, r.w, r.h);
                    }
                }
                
                ctx.globalAlpha = 1.0;
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
                    ctx.fillRect(r.x, r.y, r.w, r.h);
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
            }
        };

