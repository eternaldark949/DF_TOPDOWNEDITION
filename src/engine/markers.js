        // GameEngine — Markers: where her cars, the job's package and the job's target are. Methods are added to
        // GameEngine.prototype (see engineMixin in game-engine.js).
        //
        // On the street (world space, under the light; lit again after it by drawMissionGlow):
        //   the package, by the side door of Amber's van while a delivery waits to be fetched: a parcel in amber
        //   card with a violet ribbon, a pickup ring breathing out on the pavement round it, motes rising off it
        //   (drawDeliveryPackage). Getting into the van loads it (pickUpPackage).
        //   the drop-off: a gold ring the size of the zone she has to reach, turning, a pulse running in to its
        //   centre (drawDropZone).
        // Over the street (the HUD stage, after the light, at fixed CSS sizes: drawMarkers):
        //   pins over what's on screen — her car (crimson), Amber's van and the package (amber), the job's target
        //   (gold: the drop-off, the bounty over their head, the salvage site) — each named, faded out once she's
        //   within reach of it (the action pill takes over);
        //   the compass round her: whatever she's after that's off screen gets a chevron on a ring around her (her
        //   car when she's driving), its badge just outside and the distance — the job's target, the package, her
        //   car on foot.
        // The objective readout (#ui-objective, top centre, in the wave readout's capsule: _objectiveHud): the job,
        // how far, and the step she's on.

        const MARK_RGB = { gold: '255, 194, 72', amber: '255, 159, 67', crimson: '255, 92, 120' };

        engineMixin({
            // ── The job ──

            /** The active job, if any */
            _job() {
                const m = this.missions && this.missions.activeMission;
                return m && m.status === 'active' ? m : null;
            },

            /** Where the job's package waits: on the pavement by the side door of Amber's van, while there's a
             *  delivery to fetch and the van is here and parked. Null otherwise. (One reused point.) */
            deliveryPackageSpot() {
                const m = this._job(), van = this.deliveryVehicle;
                if (!m || m.type !== MISSION_TYPES.DELIVERY || m.pickedUp || !van || !van.visible || (this.isDriving && this.car === van)) return null;
                const off = van.width / 2 + 18, p = this._pkgSpot || (this._pkgSpot = { x: 0, y: 0, angle: 0 });
                p.x = van.x - Math.sin(van.angle) * off; p.y = van.y + Math.cos(van.angle) * off; p.angle = van.angle;
                return p;
            },

            /** She has the package: picked up by the van (the pill), or loaded with it when she drives off in the van */
            pickUpPackage(loaded = false) {
                const m = this._job();
                if (!m || m.type !== MISSION_TYPES.DELIVERY || m.pickedUp) return;
                m.pickedUp = true;
                showMessage(loaded ? 'PACKAGE LOADED IN THE VAN. DELIVER IT TO THE TARGET LOCATION.' : 'PACKAGE SECURED. DELIVER TO THE TARGET LOCATION.');
                if (this.ui && this.ui.showMissionBanner) this.ui.showMissionBanner(m.banner, 'gold', 'IN PROGRESS');
                audioSys.sfx('ui');
            },

            /** What she's after right now, for the pins, the compass and the readout: { x, y, kind, glyph, label,
             *  near (within this, she's there), lift (how high the pin stands) } or null. (One reused record.) */
            jobTarget() {
                const m = this._job();
                if (!m || !this.activeMap || this.activeMap.id !== 'hub_949') return null;
                const t = this._jobTarget || (this._jobTarget = {});
                if (m.type === MISSION_TYPES.DELIVERY && !m.pickedUp) {
                    const p = this.deliveryPackageSpot(); if (!p) return null;
                    return Object.assign(t, { x: p.x, y: p.y, tint: 'amber', glyph: 'box', label: 'PICK UP', near: 0, lift: 17 });
                }
                if (typeof m.targetX !== 'number') return null;
                Object.assign(t, { x: m.targetX, y: m.targetY, tint: 'gold', near: m.targetRadius || 80, lift: 0 });
                if (m.type === MISSION_TYPES.DELIVERY) return Object.assign(t, { glyph: 'flag', label: 'DROP-OFF' });
                if (m.type === MISSION_TYPES.BOUNTY) {
                    const e = m.targetEntity;                                   // the mark themselves, while they're about
                    if (e && !e.dead && this.enemies.includes(e)) Object.assign(t, { x: e.x, y: e.y, near: 0, lift: 34 });
                    return Object.assign(t, { glyph: 'target', label: (m.targetName || 'BOUNTY').toUpperCase() });
                }
                return Object.assign(t, { glyph: 'wrench', label: 'SALVAGE' });
            },

            // ── On the street ──

            /** The package by the van (world space, under the light): its ring on the pavement, the parcel, motes */
            drawDeliveryPackage(ctx, cull) {
                const at = this.deliveryPackageSpot();
                if (!at || (cull && (at.x < cull.left - 40 || at.x > cull.right + 40 || at.y < cull.top - 40 || at.y > cull.bottom + 40))) return;
                const t = _frameTime / 1000, k = (t * 0.55) % 1;
                ctx.save(); ctx.translate(at.x, at.y);
                // the pickup ring: one breathing out and fading, one dashed and turning
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = `rgba(255, 194, 72, ${0.6 * (1 - k)})`;
                ctx.beginPath(); ctx.arc(0, 0, 17 + k * 16, 0, Math.PI * 2); ctx.stroke();
                ctx.setLineDash([5, 4]); ctx.lineDashOffset = -t * 9;
                ctx.strokeStyle = 'rgba(255, 214, 140, 0.75)';
                ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.stroke();
                ctx.setLineDash([]);
                // its shadow, then the parcel squared to the van
                ctx.fillStyle = 'rgba(8, 2, 14, 0.38)';
                ctx.beginPath(); ctx.ellipse(1.5, 2.5, 12.5, 10, 0, 0, Math.PI * 2); ctx.fill();
                ctx.rotate(at.angle);
                const w = 20, h = 16;
                ctx.fillStyle = '#8a4d14'; ctx.fillRect(-w / 2 + 1, -h / 2 + 1.5, w, h);              // its side, in shade
                const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
                g.addColorStop(0, '#f2b45a'); g.addColorStop(1, '#c47a26');
                ctx.fillStyle = g; ctx.fillRect(-w / 2, -h / 2, w, h);                               // amber card
                ctx.strokeStyle = 'rgba(255, 236, 196, 0.55)'; ctx.lineWidth = 0.8; ctx.strokeRect(-w / 2 + 0.4, -h / 2 + 0.4, w - 0.8, h - 0.8);
                ctx.fillStyle = '#7c4fe0'; ctx.fillRect(-1.6, -h / 2, 3.2, h); ctx.fillRect(-w / 2, -1.6, w, 3.2);   // the violet ribbon
                ctx.fillStyle = '#b79bff'; ctx.fillRect(-0.6, -h / 2, 1, h); ctx.fillRect(-w / 2, -0.6, w, 1);
                ctx.fillStyle = '#9b74ff';                                                            // the bow
                ctx.beginPath(); ctx.ellipse(-3.2, -1.2, 3.2, 2, -0.5, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(3.2, -1.2, 3.2, 2, 0.5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#ffd76a'; ctx.beginPath(); ctx.arc(0, -0.6, 1.5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#fbf3e4'; ctx.fillRect(w / 2 - 7.5, h / 2 - 5.5, 6, 4);              // the address label
                ctx.fillStyle = 'rgba(80, 40, 20, 0.6)'; ctx.fillRect(w / 2 - 6.5, h / 2 - 4.5, 4, 0.7); ctx.fillRect(w / 2 - 6.5, h / 2 - 3.1, 3, 0.7);
                ctx.rotate(-at.angle);
                // motes rising off it, gold
                for (let i = 0; i < 3; i++) {
                    const q = (t * 0.7 + i / 3) % 1, mx = Math.sin(i * 2.4 + t * 1.3) * 7, my = -6 - q * 22;
                    ctx.fillStyle = `rgba(255, 224, 150, ${0.85 * Math.sin(q * Math.PI)})`;
                    ctx.beginPath(); ctx.moveTo(mx, my - 2); ctx.lineTo(mx + 1.3, my); ctx.lineTo(mx, my + 2); ctx.lineTo(mx - 1.3, my); ctx.closePath(); ctx.fill();
                }
                ctx.restore();
            },

            /** The delivery's drop-off (world space, under the light): the zone she has to reach, ringed in gold */
            drawDropZone(ctx, cull) {
                const m = this._job();
                if (!m || m.type !== MISSION_TYPES.DELIVERY || !m.pickedUp || this.activeMap.id !== 'hub_949') return;
                const r = m.targetRadius || 100, x = m.targetX, y = m.targetY;
                if (cull && (x + r < cull.left || x - r > cull.right || y + r < cull.top || y - r > cull.bottom)) return;
                const t = _frameTime / 1000, k = (t * 0.45) % 1;
                ctx.save(); ctx.translate(x, y);
                const g = ctx.createRadialGradient(0, 0, r * 0.25, 0, 0, r);
                g.addColorStop(0, 'rgba(255, 194, 72, 0)'); g.addColorStop(0.8, 'rgba(255, 194, 72, 0.06)'); g.addColorStop(1, 'rgba(255, 194, 72, 0.16)');
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
                ctx.setLineDash([16, 11]); ctx.lineDashOffset = -t * 14; ctx.lineWidth = 2.5;
                ctx.strokeStyle = 'rgba(255, 214, 140, 0.7)';
                ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
                ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255, 194, 72, ${0.5 * (1 - k)})`;               // a pulse running in
                ctx.beginPath(); ctx.arc(0, 0, r * (1 - 0.8 * k), 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = 'rgba(255, 224, 150, 0.85)';                                           // the doorstep: a gold diamond
                ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 0); ctx.lineTo(0, 7); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
                ctx.restore();
            },

            /** After the light (drawEmissivePass): the package and the drop-off glow, so the night doesn't hide them */
            drawMissionGlow(ctx, dark) {
                const a = Math.min(1, dark * 1.5);
                if (a < 0.04) return;
                const t = _frameTime / 1000;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                const p = this.deliveryPackageSpot();
                if (p) {
                    ctx.globalAlpha = a * 0.7;
                    ctx.drawImage(glowSprite('255, 170, 70', 0.3), p.x - 34, p.y - 34, 68, 68);
                    ctx.globalAlpha = a * 0.55; ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffc248';
                    ctx.setLineDash([5, 4]); ctx.lineDashOffset = -t * 9;
                    ctx.beginPath(); ctx.arc(p.x, p.y, 21, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
                }
                const m = this._job();
                if (m && m.type === MISSION_TYPES.DELIVERY && m.pickedUp && this.activeMap.id === 'hub_949') {
                    const r = m.targetRadius || 100;
                    ctx.globalAlpha = a * 0.45; ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffc248';
                    ctx.setLineDash([16, 11]); ctx.lineDashOffset = -t * 14;
                    ctx.beginPath(); ctx.arc(m.targetX, m.targetY, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
                    ctx.globalAlpha = a * 0.5;
                    ctx.drawImage(glowSprite('255, 194, 72', 0.3), m.targetX - 22, m.targetY - 22, 44, 44);
                }
                ctx.restore();
            },

            // ── Over the street ──

            /** The pins over what's on screen and the compass round her for what isn't (see the top of the file) */
            drawMarkers(ctx) {
                const v = this.view, p = this.player;
                if (!this.running || !v || !p || !this.activeMap || this.activeMap.id !== 'hub_949' ||
                    (this.scenes && this.scenes.running) || (this.cutscene && this.cutscene.active) ||
                    this.cineCam || this.finisher || this.finCam || (this.bumperMinigame && this.bumperMinigame.active)) return;
                const s = this._renderScale || 1, z = v.zoom, cw = this.canvas.width, ch = this.canvas.height;
                const S = (wx, wy, o) => { o.sx = cw / 2 + (wx - v.x + (v.shakeX || 0)) * z; o.sy = ch / 2 + (wy - v.y + (v.shakeY || 0)) * z; return o; };
                // the compass's centre: her, or the car she's driving
                const hub = this.isDriving && this.car ? this.car : p, c = S(hub.x, hub.y, this._markHub || (this._markHub = {}));
                const R = this.isDriving && this.car ? Math.max(66 * s, this.car.length * 0.5 * z + 30 * s) : 54 * s;
                const pool = this._markPool || (this._markPool = []), out = this._markRing || (this._markRing = []);
                let n = 0; out.length = 0;
                const mark = (wx, wy, tint, glyph, pinGlyph, label, opts) => {
                    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return;
                    const o = pool[n] || (pool[n] = {}); n++;
                    S(wx, wy, o);
                    Object.assign(o, { lift: 0, compass: false, fadeNear: false, pulse: false }, { wx, wy, tint, glyph, pinGlyph, label, d: Math.hypot(wx - p.x, wy - p.y) }, opts);
                    const m = 14 * s, on = o.sx > m && o.sx < cw - m && o.sy > m + 30 * s && o.sy < ch - m;
                    if (on) this._drawPin(ctx, o, s, z);
                    else if (o.compass) { o.a = Math.atan2(o.sy - c.sy, o.sx - c.sx); out.push(o); }
                };
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
                ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
                const tgt = this.jobTarget(), fetching = !!(tgt && tgt.glyph === 'box');
                if (tgt && !(tgt.near && Math.hypot(tgt.x - p.x, tgt.y - p.y) < tgt.near)) {
                    // (a drop-off has its ring on the ground: the pin stands over it all the same, to read from afar)
                    mark(tgt.x, tgt.y, tgt.tint, tgt.glyph, tgt.glyph, tgt.label, { lift: tgt.lift, compass: true, fadeNear: fetching, pulse: true });
                }
                const van = this.deliveryVehicle;
                if (!fetching && van && van.visible && !(this.isDriving && this.car === van)) {
                    mark(van.x, van.y, 'amber', 'car', 'car', 'AMBER DELIVERY', { lift: van.length * 0.32, compass: false, fadeNear: true });
                }
                const own = this.ownedCar;
                if (own && own.visible && !(this.isDriving && this.car === own)) {
                    mark(own.x, own.y, 'crimson', 'car', 'car', 'YOUR CAR', { lift: own.length * 0.32, compass: !this.isDriving, fadeNear: true });
                }
                if (out.length) this._drawCompass(ctx, out, c.sx, c.sy, R, s);
                ctx.restore();
                for (let i = 0; i < n; i++) pool[i].label = null;              // (no strings or targets held past the frame)
            },

            /** A pin standing over its point, named underneath it in the ride tag's capsule */
            _drawPin(ctx, o, s, z) {
                let alpha = 1;
                // fade in from just past the action pill's reach (80) to a car-length beyond it
                if (o.fadeNear) { const t = clamp((o.d - 90) / 80, 0, 1); alpha = t * t * (3 - 2 * t); }
                if (alpha < 0.02) return;
                const kind = (o.tint === 'amber' ? 'amberPin:' : o.tint === 'gold' ? 'goldPin:' : 'pin:') + o.pinGlyph;
                const css = 28, head = css * s, x = o.sx, y = o.sy - ((o.lift || 0) * z + 4 * s) + Math.sin(_frameTime / 450) * 2 * s;
                ctx.globalAlpha = alpha;
                MapIcons.draw(ctx, kind, x, y, { dpr: s, css });
                this._markLabel(ctx, o.label, x, y - head * 1.24, MARK_RGB[o.tint], s);
                ctx.globalAlpha = 1;
            },

            /** The compass: off-screen targets as chevrons on a ring of radius R round (cx, cy), badge and distance outside */
            _drawCompass(ctx, items, cx, cy, R, s) {
                // keep them apart: sorted round the ring, each at least a badge's width from the last
                items.sort((a, b) => a.a - b.a);
                const gap = Math.min(0.7, (34 * s) / R);
                for (let pass = 0; pass < 2; pass++) for (let i = 1; i < items.length; i++) if (items[i].a - items[i - 1].a < gap) items[i].a = items[i - 1].a + gap;
                ctx.font = `600 ${9 * s}px Montserrat, sans-serif`;
                if ('letterSpacing' in ctx) ctx.letterSpacing = `${1.5 * s}px`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                for (const o of items) {
                    const ux = Math.cos(o.a), uy = Math.sin(o.a), rgb = MARK_RGB[o.tint];
                    const k = o.pulse ? 1 + 0.08 * Math.sin(_frameTime / 260) : 1, w = 8 * s * k;
                    const tx = cx + ux * R, ty = cy + uy * R;
                    ctx.globalAlpha = 0.95;
                    // the chevron: an arrowhead with a notched back, a dark keyline, its colour
                    ctx.beginPath();
                    ctx.moveTo(tx + ux * w, ty + uy * w);
                    ctx.lineTo(tx - ux * w * 0.75 - uy * w, ty - uy * w * 0.75 + ux * w);
                    ctx.lineTo(tx - ux * w * 0.2, ty - uy * w * 0.2);
                    ctx.lineTo(tx - ux * w * 0.75 + uy * w, ty - uy * w * 0.75 - ux * w);
                    ctx.closePath();
                    ctx.lineJoin = 'round'; ctx.lineWidth = 2.2 * s; ctx.strokeStyle = 'rgba(18, 6, 28, 0.85)'; ctx.stroke();
                    ctx.fillStyle = `rgb(${rgb})`; ctx.fill();
                    // the badge just outside it
                    const br = R + 19 * s, bx = cx + ux * br, by = cy + uy * br;
                    MapIcons.draw(ctx, (o.tint === 'amber' ? 'amberBadge:' : o.tint === 'crimson' ? 'crimsonBadge:' : 'badge:') + o.glyph, bx, by, { dpr: s, css: 20 });
                    // and the distance, clear of the badge along the same line
                    const label = Math.round(o.d / 10) * 10 + 'm', tw = ctx.measureText(label).width + 10 * s, th = 13 * s;
                    const lr = br + 11 * s + Math.abs(ux) * tw / 2 + Math.abs(uy) * th / 2, lx = cx + ux * lr, ly = cy + uy * lr;
                    ctx.fillStyle = 'rgba(12, 4, 24, 0.68)'; ctx.strokeStyle = `rgba(${rgb}, 0.5)`; ctx.lineWidth = Math.max(1, s);
                    ctx.beginPath(); ctx.roundRect(lx - tw / 2, ly - th / 2, tw, th, th / 2); ctx.fill(); ctx.stroke();
                    ctx.fillStyle = '#f3e4c6'; ctx.fillText(label, lx + 0.75 * s, ly + 0.5 * s);
                }
                if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
                ctx.globalAlpha = 1;
            },

            /** A name in the ride tag's capsule (ink to violet, a hairline rim in `rgb`, cream caps), centred on (x, y) */
            _markLabel(ctx, text, x, y, rgb, s) {
                ctx.font = `600 ${9 * s}px Montserrat, sans-serif`;
                if ('letterSpacing' in ctx) ctx.letterSpacing = `${2 * s}px`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const tw = ctx.measureText(text).width + 14 * s, th = 15 * s;
                ctx.fillStyle = 'rgba(12, 4, 24, 0.68)'; ctx.strokeStyle = `rgba(${rgb}, 0.55)`; ctx.lineWidth = Math.max(1, s);
                ctx.beginPath(); ctx.roundRect(x - tw / 2, y - th / 2, tw, th, th / 2); ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#f3e4c6';
                ctx.fillText(text, x + s, y + 0.5 * s);
                if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
            },

            // ── The objective readout ──

            /** #ui-objective (top centre): the job's title, how far its target is (on the hub), the step she's on.
             *  Hidden with no job or in a scene. Writes the DOM only when something it shows changes. */
            _objectiveHud() {
                const el = this._objEl || (this._objEl = document.getElementById('ui-objective'));
                if (!el) return;
                const m = this._job(), show = !!m && !(this.scenes && this.scenes.running) && !(this.cutscene && this.cutscene.active);
                let key = '';
                if (show) {
                    const parts = this.missions.getObjectiveParts(), t = this.jobTarget();
                    const dist = t ? Math.round(Math.hypot(t.x - this.player.x, t.y - this.player.y) / 10) * 10 + 'm' : '';
                    key = parts.title + '|' + parts.step + '|' + dist;
                    if (key !== this._objKey) {
                        if (!el.firstChild) el.innerHTML = '<div class="o-line"><span class="o-ico"></span><span class="o-title"></span><span class="o-sep">◆</span><span class="o-dist"></span></div><div class="o-step"></div>';
                        const q = c => el.querySelector(c);
                        q('.o-title').textContent = parts.title; q('.o-step').textContent = parts.step; q('.o-dist').textContent = dist;
                        el.classList.toggle('no-dist', !dist);
                        if (!q('.o-ico').firstChild && typeof ACTION_ICONS !== 'undefined' && ACTION_ICONS.objective) q('.o-ico').innerHTML = ACTION_ICONS.objective;
                    }
                }
                if (key === this._objKey) return;
                this._objKey = key;
                el.classList.toggle('show', !!key);
                document.body.classList.toggle('objective-hud', !!key);
            },
        });
