        // GameEngine — Scope view: with a sniper up to her eye, the world darkens and only a soft
        // lane about her width stays lit along her line of fire, out to where the shot would
        // land. Eases in and out; the lane sways a little, then steadies (the cue to take the
        // shot). The camera leans down the line. Setting: GameSettings.scopeView.
        // Scope slow-mo (GameSettings.scopeSlow): while she holds the scope, time eases down to
        // SCOPE.SLOW with it — for a few breaths. Her focus (SCOPE.FOCUS real seconds) drains while
        // she's slowed and refills once she lifts the scope; as it runs out, time eases back.
        // A thin arc round her shows what's left. The loop takes the slower of this and any
        // other time slow (a finisher, a boss's fall).
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        const SCOPE = {
            IN: 7, OUT: 9,                // easing rates (per second) — about 0.25 s in, 0.2 s out
            VEIL: 0.55,                   // darkness at full scope
            VEIL_RGB: '10, 6, 20',        // the violet-black of the night
            WIDTH: 30,                    // the lane's width (world px) — about her own
            RANGE: 950,                   // how far she can look (world px), clipped at walls
            LEAN: 0.3,                    // camera lean down the line, as a share of the half-view
            SWAY: 0.014, STEADY: 0.6,     // radians of breathing sway; seconds to settle
            SLOW: 0.35,                   // time scale at full scope
            FOCUS: 3,                     // real seconds of slow-mo in a full breath
            RECHARGE: 0.6,                // focus back per real second with the scope down
            FADE: 0.6                     // the last of the focus eases time back to full speed
        };

        engineMixin({
            /** Is she looking down a sniper's sight right now? */
            isScoping() {
                if (GameSettings.scopeView === false || this.weaponMode !== 'sniper' || this.weaponHolstered || this.isDriving || this.paused) return false;
                const F = this.fireJoystick;
                return !!((F.active && (F.aimed || F.armed)) || (this.mouseDown && this.mouseX));
            },

            /** Ease the scope in or out; track how long she's held it (for the sway to settle). */
            updateScope() {
                const on = this.isScoping(), dt = 1 / 60 / Math.max(0.05, this._loopScale || 1);   // real time, so it eases the same in slow-mo
                const k = this.scopeK || 0, target = on ? 1 : 0;
                this.scopeK = k + (target - k) * (1 - Math.exp(-(on ? SCOPE.IN : SCOPE.OUT) * dt));
                if (this.scopeK < 0.002) this.scopeK = 0;
                this._scopeHeld = on ? (this._scopeHeld || 0) + dt : 0;
                // Camera lean down the line (eased with the scope)
                const a = this.player.angle, half = Math.min(this.canvas.width, this.canvas.height) / 2 / (this.camera.zoom || 1);
                this.scopeLeanX = Math.cos(a) * half * SCOPE.LEAN * this.scopeK;
                this.scopeLeanY = Math.sin(a) * half * SCOPE.LEAN * this.scopeK;
            },

            /**
             * Once a rendered frame (real ms, loop.js): the time scale the scope asks for (1 = none).
             * Drains her focus while she's slowed; refills it while the scope is down.
             */
            scopeTimeScale(elapsedMs) {
                if (this._focus === undefined) this._focus = SCOPE.FOCUS;
                if (this.paused) return this._scopeScale || 1;
                const dt = elapsedMs / 1000, k = this.scopeK || 0, scoping = this.isScoping();
                const allowed = GameSettings.scopeSlow !== false && !this.finisher && !(this.scenes && this.scenes.running);
                if (allowed && scoping) this._focus = Math.max(0, this._focus - dt * k);
                else if (!scoping) this._focus = Math.min(SCOPE.FOCUS, this._focus + dt * SCOPE.RECHARGE);
                const fk = Math.min(1, this._focus / SCOPE.FADE);
                return (this._scopeScale = allowed ? 1 - (1 - SCOPE.SLOW) * k * fk : 1);
            },

            /** The focus arc round her while she's scoped (world space): lavender, draining clockwise */
            _drawFocusArc(ctx, k) {
                if (GameSettings.scopeSlow === false || this._focus === undefined) return;
                const f = this._focus / SCOPE.FOCUS, p = this.player;
                if (f >= 0.999 && (this._scopeScale ?? 1) >= 0.999) return;
                ctx.save(); ctx.lineCap = 'round';
                ctx.strokeStyle = `rgba(202, 176, 250, ${0.16 * k})`; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(p.x, p.y, 27, 0, Math.PI * 2); ctx.stroke();
                ctx.strokeStyle = f < 0.25 ? `rgba(255, 138, 146, ${0.85 * k})` : `rgba(241, 232, 254, ${0.75 * k})`;
                ctx.beginPath(); ctx.arc(p.x, p.y, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); ctx.stroke();
                ctx.restore();
            },

            /** A soft lane sprite: bright along its middle, feathered at the sides, fading at the far end. */
            _scopeLaneSprite() {
                if (this._scopeLane) return this._scopeLane;
                const W = 256, H = 32, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
                const c = cv.getContext('2d'), img = c.createImageData(W, H);
                for (let y = 0; y < H; y++) {
                    const across = 1 - Math.pow(Math.abs(y - (H - 1) / 2) / (H / 2), 2);           // soft sides
                    for (let x = 0; x < W; x++) {
                        const u = x / (W - 1), along = u < 0.06 ? u / 0.06 : u > 0.72 ? Math.max(0, (1 - u) / 0.28) : 1;
                        const i = (y * W + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
                        img.data[i + 3] = Math.round(255 * Math.max(0, across) * along);
                    }
                }
                c.putImageData(img, 0, 0);
                return (this._scopeLane = cv);
            },

            /** Drawn after the lighting and glows, in world space (the camera transform is on ctx). */
            drawScopeView(ctx) {
                const k = this.scopeK || 0;
                if (k <= 0) return;
                const p = this.player, t = _gameTimeSec;
                const steady = Math.min(1, (this._scopeHeld || 0) / SCOPE.STEADY);
                // The lane leaves from the gun at her eye — the same line the shot takes (aimFromMuzzle)
                const shot = p._muzzleLocal && p._muzzleReady ? aimFromMuzzle(p, p.angle) : { x: p.x + Math.cos(p.angle) * 6, y: p.y + Math.sin(p.angle) * 6, angle: p.angle };
                const a = shot.angle + (Math.sin(t * 1.7) * 0.7 + Math.sin(t * 3.1) * 0.3) * SCOPE.SWAY * (1 - steady);
                const ex = shot.x, ey = shot.y;
                const far = raycastNearest(ex, ey, ex + Math.cos(a) * SCOPE.RANGE, ey + Math.sin(a) * SCOPE.RANGE,
                    [...(this.activeMap.walls || []), ...getColliders(this.activeMap)], SCOPE.RANGE);
                // The veil on its own half-resolution layer (it's all soft), with the lane cut out of it
                const R = 0.5, W = Math.ceil(this.canvas.width * R), H = Math.ceil(this.canvas.height * R);
                const v = this._scopeVeil || (this._scopeVeil = document.createElement('canvas'));
                if (v.width !== W || v.height !== H) { v.width = W; v.height = H; }
                const vc = v.getContext('2d');
                vc.setTransform(1, 0, 0, 1, 0, 0);
                vc.clearRect(0, 0, W, H);
                vc.globalCompositeOperation = 'source-over';
                vc.fillStyle = `rgba(${SCOPE.VEIL_RGB}, ${(SCOPE.VEIL * k).toFixed(3)})`;
                vc.fillRect(0, 0, W, H);
                const m = ctx.getTransform();                                                 // same world → screen as the scene, at half size
                vc.setTransform(m.a * R, m.b * R, m.c * R, m.d * R, m.e * R, m.f * R);
                vc.globalCompositeOperation = 'destination-out';
                vc.translate(ex, ey); vc.rotate(a);
                vc.drawImage(this._scopeLaneSprite(), 0, -SCOPE.WIDTH / 2, far + 40, SCOPE.WIDTH);
                vc.setTransform(1, 0, 0, 1, 0, 0);
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(v, 0, 0, this.canvas.width, this.canvas.height);
                ctx.restore();
                // Inside the lane: a hairline down the sight, and the faintest cool glass tint
                ctx.save();
                ctx.translate(ex, ey); ctx.rotate(a);
                ctx.globalAlpha = 0.10 * k; ctx.globalCompositeOperation = 'lighter';
                ctx.drawImage(this._scopeLaneSprite(), 0, -SCOPE.WIDTH / 2, far + 40, SCOPE.WIDTH);
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = (0.35 + 0.35 * steady) * k; ctx.strokeStyle = steady >= 1 ? '#ffd9a0' : '#ff6a7a'; ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(far, 0); ctx.stroke();
                ctx.restore();
                this._drawFocusArc(ctx, k);                                  // over the veil, so it reads
            },
        });
