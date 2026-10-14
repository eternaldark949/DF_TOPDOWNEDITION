        // Dynamic lamp occlusion belongs to each light's contribution, never to
        // a darkness overlay added after unrelated lights have been combined.
        // Renderers only register a caster; light selection, visibility, projection
        // and bounded caches live here. Contact / sun shadows are independent.
        const DYNAMIC_SHADOW = {
            CELL: 128, MAX_CASTERS: 256, MAX_BYTES: 24 * 1048576,
            MAX_CAPTURES: 16, SILHOUETTE_SIDE: 40,
            low: { maxLights: 8, perLight: 12, density: 0.25, side: 128, reach: 90 },
            high: { maxLights: 16, perLight: 24, density: 0.5, side: 256, reach: 120 },
            ultra: { maxLights: 32, perLight: 32, density: 0.5, side: 256, reach: Infinity }
        };
        const DynamicShadows = {
            map: null, frame: 0, engine: null, quality: 'off', bytes: 0,
            entries: new WeakMap(), lights: new Map(), keeps: new WeakMap(),
            casters: [], cells: new Map(), geometry: new Map(), wallRefs: new Set(), revision: 0, wallRevision: 0,
            _nextId: 0, _captureCount: 0, _mask: null, _casterMask: null, _white: null,
            stats: { casters: 0, pairs: 0, blocked: 0, rays: 0, builds: 0, hits: 0, dropped: 0, captures: 0 },

            clear() {
                this.entries = new WeakMap(); this.keeps = new WeakMap();
                this.lights.clear(); this.cells.clear(); this.geometry.clear(); this.wallRefs.clear(); this.wallRevision++;
                this.casters.length = 0; this.bytes = 0; this.revision++;
            },
            begin(engine) {
                const quality = GameSettings.lampShadows || 'low';
                if (this.map !== engine.activeMap || quality !== this.quality) this.clear();
                this.engine = engine; this.map = engine.activeMap; this.quality = quality;
                this.frame++; this._captureCount = 0; this._shadowLightCount = 0; this.casters.length = 0; this.cells.clear();
                this.visible = !!(this.map && (engine.lamps || []).length && engine.getAmbientDarkness() > 0.01);
                for (const k in this.stats) this.stats[k] = 0;
                if (quality === 'off' || !this.map) return;
                // Check geometry once for all lamps. Queries share the existing spatial index.
                const obstacles = getOccluders(this.map), seen = new Set(), walls = new Set(); let changed = false, staticChanged = false;
                for (const o of obstacles) {
                    if (!o) continue;
                    seen.add(o); walls.add(o);
                    const values = [o.x, o.y, o.w ?? o.width, o.h ?? o.height];
                    const old = this.geometry.get(o);
                    if (!old || values.some((v, i) => !Object.is(v, old[i]))) { this.geometry.set(o, values); changed = staticChanged = true; }
                }
                if (walls.size !== this.wallRefs.size || [...walls].some(o => !this.wallRefs.has(o))) staticChanged = true;
                this.wallRefs = walls;
                if (staticChanged) this.wallRevision++;
                const rs = engine.roomSystem;
                for (const d of (rs && rs.active ? rs.doors : []) || []) {
                    seen.add(d); const values = [d.openAmount, d.x, d.y, d.angle];
                    const old = this.geometry.get(d);
                    if (!old || values.some((v, i) => !Object.is(v, old[i]))) { this.geometry.set(d, values); changed = true; }
                }
                for (const o of this.geometry.keys()) if (!seen.has(o)) { this.geometry.delete(o); changed = true; }
                if (changed) { this.revision++; _physicsSpatial.invalidate(obstacles); }
                // Release unseen sources, including maps with edited lamp membership.
                const sources = new Set(engine.lamps || []);
                for (const [light, s] of this.lights) if (!sources.has(light) || this.frame - s.used > 120) {
                    this.bytes -= s.bytes; this.lights.delete(light);
                }
            },

            // Shapes are in an entity's local ground frame. elevation controls the
            // cast length; radius / width / depth describe the footprint, not height.
            note(entity, shape = {}) {
                if (!this.map || !this.visible || this.quality === 'off' || _zoomLOD >= 2 || !entity || entity.visible === false || entity.active === false || entity.dead || entity.inCar || entity._reflectionProxy) return;
                const x = entity.x + (shape.dx || 0), y = entity.y + (shape.dy || 0);
                if (!Number.isFinite(x + y)) return;
                let e = this.entries.get(entity);
                if (!e) { e = { entity, id: ++this._nextId, revision: 0, frame: -1 }; this.entries.set(entity, e); }
                if (e.frame === this.frame) return;
                if (this.casters.length >= DYNAMIC_SHADOW.MAX_CASTERS) { this.stats.dropped++; return; }
                if (shape.points && (!Array.isArray(shape.points) || shape.points.length < 3 || shape.points.length > 32 || shape.points.some(p => !Array.isArray(p) || !Number.isFinite(p[0] + p[1])))) return;
                const kind = shape.kind || 'circle', width = shape.width || (shape.radius || entity.radius || 9) * 2;
                const depth = shape.depth || width, angle = entity.angle || 0, elevation = shape.elevation ?? 24;
                const opacity = shape.opacity ?? 0.85;
                if (!(width > 0 && depth > 0 && elevation > 0 && opacity > 0) || !Number.isFinite(width + depth + angle + elevation + opacity)) return;
                const pointsKey = shape.points ? shape.points.flat().join(',') : null;
                if (e.pointsKey !== pointsKey) e.revision++;
                e.pointsKey = pointsKey;
                if (e.x !== x || e.y !== y || e.angle !== angle || e.width !== width || e.depth !== depth || e.kind !== kind || e.elevation !== elevation || e.opacity !== opacity || e.points !== shape.points) e.revision++;
                Object.assign(e, { x, y, angle, width, depth, kind, elevation, opacity, points: shape.points, frame: this.frame });
                const key = Math.floor(x / DYNAMIC_SHADOW.CELL) + ',' + Math.floor(y / DYNAMIC_SHADOW.CELL);
                let cell = this.cells.get(key); if (!cell) this.cells.set(key, cell = []);
                cell.push(e); this.casters.push(e); this.stats.casters++;
            },
            noteHuman(e) { this.note(e, { kind: 'human', width: 18, depth: 18, elevation: 24 }); },
            noteVehicle(e) { this.note(e, { kind: 'box', width: e.length, depth: e.vehicleWidth || e.width, elevation: 15 }); },
            noteProp(e) {
                if (!e.hasCollision || e.noNav) return;
                this.note(e, { kind: 'box', dx: e.width / 2, dy: e.height / 2, width: e.width, depth: e.height, elevation: Math.min(24, Math.max(6, Math.min(e.width, e.height) * 0.5)) });
            },
            reachable(light, x, y) {
                this.stats.rays++;
                const obstacles = getOccluders(this.map);
                const candidates = _physicsSpatial.query(obstacles, { left: Math.min(light.x, x), right: Math.max(light.x, x), top: Math.min(light.y, y), bottom: Math.max(light.y, y) });
                for (const o of candidates) if (o && segCrossesRect(light.x, light.y, x, y, o.x, o.y, o.w ?? o.width, o.h ?? o.height)) return false;
                const rs = this.engine.roomSystem;
                return !(rs && rs.active && rs.doorBlocks(light.x, light.y, x, y));
            },
            wantsSilhouette(e, config) {
                if (this.quality !== 'high' || config._crowdBake || config.isDriving || config.noShadow || e._reflectionProxy || _zoomLOD >= 2 || !this.map || !this.visible) return false;
                if (this._captureCount >= DYNAMIC_SHADOW.MAX_CAPTURES) return false;
                const key = JSON.stringify([config.body, config.hair, config.top, config.bottom, config.shoes, config.hat, config.weapon, config.pose, config.stance]);
                const keep = this.keeps.get(e), moving = e._gait && e._gait.speed > CONFIG.GAIT.STOP_SPEED;
                if (keep && keep.key === key && keep.angle === e.angle && _frameTime - keep.at < (moving ? 100 : 1000)) return false;
                const lights = this.engine.lamps || [];
                let near = false;
                const rs = this.engine.roomSystem;
                for (const l of lights) if ((l.intensity ?? 1) > 0 && (!rs || !rs.active || !rs.lampLight || rs.lampLight(l) > 0.01) && lampWake(l) > 0.01 && Math.hypot(l.x - e.x, l.y - e.y) < l.radius && this.reachable(l, e.x, e.y)) { near = true; break; }
                if (!near) return false;
                e._dynamicShadowCaptureKey = key;
                this._captureCount++; this.stats.captures++;
                return true;
            },
            keepSilhouette(e, cv, ox, oy, side) {
                const W = typeof _worldMatrix !== 'undefined' ? _worldMatrix : null;
                if (!W || !side || typeof DOMMatrix === 'undefined' || !this.map) return;
                let k = this.keeps.get(e);
                if (!k) {
                    const canvas = document.createElement('canvas'); canvas.width = canvas.height = DYNAMIC_SHADOW.SILHOUETTE_SIDE;
                    k = { cv: canvas, revision: 0 }; this.keeps.set(e, k);
                }
                const g = k.cv.getContext('2d'), half = side / 2;
                const cut = Math.min(half, CONFIG.HUMAN_SHADE.LAMP_SHADOW_CAP_R * Math.hypot(W.a, W.b)), offset = half - cut;
                g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'copy';
                g.drawImage(cv, offset, offset, cut * 2, cut * 2, 0, 0, k.cv.width, k.cv.height);
                g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, k.cv.width, k.cv.height); g.globalCompositeOperation = 'source-over';
                const scale = cut * 2 / k.cv.width;
                k.m = new DOMMatrix([W.a, W.b, W.c, W.d, W.e, W.f]).inverse().multiply(new DOMMatrix([scale, 0, 0, scale, ox + offset, oy + offset]));
                k.x = e.x; k.y = e.y; k.angle = e.angle; k.at = _frameTime; k.key = e._dynamicShadowCaptureKey; k.revision++;
            },

            _state(light) {
                let s = this.lights.get(light);
                if (!s) { s = { pairs: new Map(), used: this.frame, bytes: 0, signature: null, path: null }; this.lights.set(light, s); }
                s.used = this.frame;
                return s;
            },
            _pairs(light, s, policy) {
                const candidates = [], R = light.radius, C = DYNAMIC_SHADOW.CELL;
                for (let bx = Math.floor((light.x - R) / C); bx <= Math.floor((light.x + R) / C); bx++) for (let by = Math.floor((light.y - R) / C); by <= Math.floor((light.y + R) / C); by++) {
                    const cell = this.cells.get(bx + ',' + by);
                    if (cell) for (const e of cell) {
                        const d = Math.hypot(e.x - light.x, e.y - light.y);
                        if (d > Math.max(e.width, e.depth) * 0.5 && d < R) candidates.push({ e, d });
                    }
                }
                candidates.sort((a, b) => a.d - b.d || a.e.id - b.e.id);
                const out = [], present = new Set();
                for (const { e, d } of candidates) {
                    present.add(e);
                    let p = s.pairs.get(e);
                    if (!p || p.revision !== e.revision || p.geometry !== this.revision || p.lx !== light.x || p.ly !== light.y || p.radius !== R) {
                        p = { e, d, revision: e.revision, geometry: this.revision, lx: light.x, ly: light.y, radius: R, visible: this.reachable(light, e.x, e.y) };
                        s.pairs.set(e, p);
                    }
                    if (!p.visible) { this.stats.blocked++; continue; }
                    if (out.length >= policy.perLight) { this.stats.dropped++; continue; }
                    out.push(p);
                }
                for (const e of s.pairs.keys()) if (!present.has(e)) s.pairs.delete(e);
                return out;
            },
            _path(light, s) {
                if (s.path && s.pathRevision === this.wallRevision && s.pathX === light.x && s.pathY === light.y && s.pathR === light.radius && s.poly === light._shadowPoly) return s.path;
                // The lamp's static visibility is native too; recompute when the
                // source or map geometry moves, rather than using a stale bake.
                const poly = computeVisibilityPoly(light.x, light.y, light.radius, getOccluders(this.map), { aMin: 0, aMax: Math.PI * 2, arcStep: 0.18 });
                const path = new Path2D();
                if (poly.length) { path.moveTo(poly[0].x, poly[0].y); for (let i = 1; i < poly.length; i++) path.lineTo(poly[i].x, poly[i].y); path.closePath(); }
                Object.assign(s, { path, pathRevision: this.wallRevision, pathX: light.x, pathY: light.y, pathR: light.radius, poly: light._shadowPoly });
                return path;
            },
            _hull(points) {
                points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
                const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
                const lo = [], hi = [];
                for (const p of points) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
                for (let i = points.length - 1; i >= 0; i--) { const p = points[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
                lo.pop(); hi.pop(); return lo.concat(hi);
            },
            _cast(g, light, pair, policy) {
                const e = pair.e, d = pair.d, ang = Math.atan2(e.y - light.y, e.x - light.x);
                const slope = e.elevation / Math.max(1, (light.elevation ?? 84) - e.elevation);
                const len = Math.min(policy.reach, Math.max(0, light.radius - d), d * slope);
                const keep = this.quality === 'low' ? null : this.keeps.get(e.entity);
                g.save(); g.globalAlpha = Math.max(0, Math.min(1, e.opacity));
                if (keep && keep.m && keep.angle === e.angle && this.quality !== 'ultra') {
                    const D = CONFIG.HUMAN_SHADE.LAMP_SHADOW_DEPTH;
                    g.translate(e.x, e.y); g.rotate(ang); g.translate(-D / 2, 0); g.scale((D + len) / D, 1); g.translate(D / 2, 0);
                    g.rotate(-ang); g.translate(-keep.x, -keep.y);
                    const m = keep.m; g.transform(m.a, m.b, m.c, m.d, m.e, m.f); g.drawImage(keep.cv, 0, 0);
                } else if (this.quality === 'low' && e.kind !== 'box' && e.kind !== 'polygon') {
                    g.translate(e.x, e.y); g.rotate(ang);
                    g.drawImage(this._white || (this._white = glowSprite('255, 255, 255', 0.55)), -e.width / 2, -e.depth / 2, e.width + len, e.depth);
                } else {
                    const local = e.points || (e.kind === 'box' ? [[-e.width / 2, -e.depth / 2], [e.width / 2, -e.depth / 2], [e.width / 2, e.depth / 2], [-e.width / 2, e.depth / 2]]
                        : Array.from({ length: 12 }, (_, i) => [Math.cos(i * Math.PI / 6) * e.width / 2, Math.sin(i * Math.PI / 6) * e.depth / 2]));
                    const c = Math.cos(e.angle), s = Math.sin(e.angle), points = [];
                    const scale = this.quality === 'ultra' ? Math.max(1, light.radius / d) : 1 + len / d;
                    for (const p of local) {
                        const x = e.x + p[0] * c - p[1] * s, y = e.y + p[0] * s + p[1] * c;
                        points.push([x, y], [light.x + (x - light.x) * scale, light.y + (y - light.y) * scale]);
                    }
                    const hull = this._hull(points); g.fillStyle = '#fff'; g.beginPath();
                    hull.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill();
                }
                g.restore();
            },
            _base(g, e) {
                // A caster receives its own lamp light. Remove its original body
                // from this one cast before unioning it with other casters' masks.
                g.save(); g.globalAlpha = 1; g.globalCompositeOperation = 'destination-out';
                const keep = this.quality === 'low' ? null : this.keeps.get(e.entity);
                if (keep && keep.m && keep.angle === e.angle && this.quality !== 'ultra') {
                    g.translate(e.x - keep.x, e.y - keep.y);
                    const m = keep.m; g.transform(m.a, m.b, m.c, m.d, m.e, m.f); g.drawImage(keep.cv, 0, 0);
                } else {
                    g.translate(e.x, e.y); g.rotate(e.angle); g.fillStyle = '#fff'; g.beginPath();
                    if (e.points) { e.points.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); }
                    else if (e.kind === 'box') g.rect(-e.width / 2, -e.depth / 2, e.width, e.depth);
                    else g.ellipse(0, 0, e.width / 2, e.depth / 2, 0, 0, Math.PI * 2);
                    g.fill();
                }
                g.restore();
            },
            prepare(light) {
                if (this.quality === 'off' || _zoomLOD >= 2 || !this.map || !(light.radius > 0) || !Number.isFinite(light.x + light.y + light.radius)) return null;
                const policy = DYNAMIC_SHADOW[this.quality] || DYNAMIC_SHADOW.low, s = this._state(light);
                if (s.prepared === this.frame) return s.ready ? s : null;
                s.prepared = this.frame; s.ready = false;
                if (this._shadowLightCount >= policy.maxLights) { s.pairs.clear(); this.stats.dropped++; return null; }
                const pairs = this._pairs(light, s, policy); this.stats.pairs += pairs.length;
                if (!pairs.length) { if (s.bytes) { this.bytes -= s.bytes; s.bytes = 0; s.hole = s.color = null; } s.signature = null; return null; }
                this._shadowLightCount++; s.maskUsed = this.frame;
                const path = this._path(light, s), side = Math.max(32, Math.min(policy.side, Math.ceil(light.radius * 2 * policy.density)));
                const signature = [light.x, light.y, light.radius, light.elevation, light.color, this.revision, this.quality, side, ...pairs.map(p => p.e.id + ':' + p.e.revision + ':' + (this.keeps.get(p.e.entity)?.revision || 0))].join('|');
                if (signature === s.signature && s.hole) { this.stats.hits++; s.ready = true; return s; }
                const bytes = side * side * 8;
                while (this.bytes - s.bytes + bytes > DYNAMIC_SHADOW.MAX_BYTES) {
                    let oldest = null;
                    for (const [l, cached] of this.lights) if (cached !== s && cached.bytes && (cached.maskUsed || 0) < this.frame && (!oldest || (cached.maskUsed || 0) < (oldest[1].maskUsed || 0))) oldest = [l, cached];
                    if (!oldest) { this.stats.dropped += pairs.length; return null; }
                    this.bytes -= oldest[1].bytes; this.lights.delete(oldest[0]);
                }
                this.bytes += bytes - s.bytes; s.bytes = bytes;
                const mask = this._mask || (this._mask = document.createElement('canvas')); mask.width = mask.height = side;
                const mg = mask.getContext('2d'), R = light.radius, scale = side / (2 * R), x = light.x - R, y = light.y - R;
                const casterMask = this._casterMask || (this._casterMask = document.createElement('canvas'));
                casterMask.width = casterMask.height = side;
                const cg = casterMask.getContext('2d');
                for (const p of pairs) {
                    cg.setTransform(1, 0, 0, 1, 0, 0); cg.clearRect(0, 0, side, side);
                    cg.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
                    this._cast(cg, light, p, policy); this._base(cg, p.e);
                    mg.drawImage(casterMask, 0, 0);
                }
                for (const mode of ['hole', 'color']) {
                    const cv = s[mode] || (s[mode] = document.createElement('canvas')); cv.width = cv.height = side;
                    const g = cv.getContext('2d'); g.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
                    g.save(); g.clip(path);
                    const grad = g.createRadialGradient(light.x, light.y, mode === 'hole' ? Math.min(10, R * 0.1) : 0, light.x, light.y, R);
                    if (mode === 'hole') { grad.addColorStop(0, '#fff'); grad.addColorStop(1, 'rgba(255,255,255,0)'); }
                    else { grad.addColorStop(0, '#fff'); grad.addColorStop(0.1, light.color || '#fff'); grad.addColorStop(0.6, light.color || '#fff'); grad.addColorStop(1, 'rgba(0,0,0,0)'); }
                    g.fillStyle = grad; g.fillRect(x, y, R * 2, R * 2); g.restore();
                    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-out'; g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'source-over';
                }
                Object.assign(s, { signature, x, y, size: R * 2, ready: true }); this.stats.builds++;
                return s;
            },
            visibilityPath(light) {
                if (!this.map || this.quality === 'off' || !(light.radius > 0) || !Number.isFinite(light.x + light.y + light.radius)) return null;
                return this._path(light, this._state(light));
            },
            drawLight(ctx, light, mode) {
                const s = this.prepare(light);
                if (!s) return false;
                ctx.drawImage(s[mode], s.x, s.y, s.size, s.size);
                return true;
            }
        };
