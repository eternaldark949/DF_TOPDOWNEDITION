        // Dynamic lamp occlusion belongs to each light's contribution, never to
        // a darkness overlay added after unrelated lights have been combined.
        // Renderers only register a caster; light selection, visibility, projection
        // and bounded caches live here. Contact / sun shadows are independent.
        const DYNAMIC_SHADOW = {
            CELL: 128, MAX_CASTERS: 256, MAX_BYTES: 24 * 1048576,
            MAX_CAPTURES: 16, SILHOUETTE_SIDE: 40,
            low: { maxSources: 24, otherLights: 4, maxLights: 8, perLight: 12, density: 0.25, side: 128, reach: 90 },
            high: { maxSources: 48, otherLights: 8, maxLights: 16, perLight: 24, density: 0.5, side: 256, reach: 120 },
            ultra: { maxSources: 80, otherLights: 12, maxLights: 32, perLight: 32, density: 0.5, side: 256, reach: Infinity },
            // Opt-in beta: twice Ultra's raster resolution, expanded coverage; same memory ceiling.
            gamma: { maxSources: 48, otherLights: 8, maxLights: 16, perLight: 24, density: 0.5, side: 256, reach: 120 },
            beta: { maxSources: 128, otherLights: 20, maxLights: 48, perLight: 48, density: 1, side: 512, reach: Infinity }
        };
        const DynamicShadows = {
            map: null, frame: 0, engine: null, quality: 'off', bytes: 0,
            entries: new WeakMap(), lights: new Map(), keeps: new WeakMap(), sources: new WeakMap(), doorLeaves: new WeakMap(),
            casters: [], cells: new Map(), geometry: new Map(), wallRefs: new Set(), revision: 0, wallRevision: 0,
            _nextId: 0, _captureCount: 0, _mask: null, _casterMask: null, _white: null,
            stats: { casters: 0, pairs: 0, blocked: 0, rays: 0, builds: 0, hits: 0, dropped: 0, captures: 0, sources: 0, doors: 0 },

            clear() {
                GammaShadows.reset();
                this.entries = new WeakMap(); this.keeps = new WeakMap(); this.sources = new WeakMap(); this.doorLeaves = new WeakMap();
                this.lights.clear(); this.cells.clear(); this.geometry.clear(); this.wallRefs.clear(); this.wallRevision++;
                this.casters.length = 0; this.bytes = 0; this.revision++;
            },
            begin(engine) {
                const quality = GameSettings.lampShadows || 'low';
                if (this.map !== engine.activeMap || quality !== this.quality) this.clear();
                this.engine = engine; this.map = engine.activeMap; this.quality = quality;
                this.frame++; this._captureCount = 0; this._shadowLightCount = 0; this._families = Object.create(null); this.casters.length = 0; this.cells.clear();
                this.visible = !!(this.map && (engine.getAmbientDarkness() > 0.01 || (engine.projectiles || []).some(p => p.isFireball && p.active !== false) || (engine._fireTrail || []).length));
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
                    seen.add(d); const leaves = typeof d.leaves === 'function' ? d.leaves() : [];
                    const values = [d.openAmount, d.x, d.y, d.angle, d.shadowOpacity, ...leaves.flat()];
                    const old = this.geometry.get(d);
                    if (!old || values.some((v, i) => !Object.is(v, old[i]))) { this.geometry.set(d, values); changed = true; }
                }
                for (const o of this.geometry.keys()) if (!seen.has(o)) { this.geometry.delete(o); changed = true; }
                if (changed) { this.revision++; _physicsSpatial.invalidate(obstacles); }
                // Release unseen sources, including maps with edited lamp membership.
                const sources = new Set(engine.lamps || []);
                for (const [light, s] of this.lights) if ((!light.dynamic && !sources.has(light)) || this.frame - s.used > 120) {
                    this.bytes -= s.bytes; this.lights.delete(light);
                }
                if (rs && rs.active) for (const d of rs.doors || []) this.noteDoor(d);
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
                const kind = shape.kind || 'circle', width = shape.width || (shape.points ? Math.max(1, ...shape.points.map(p => Math.abs(p[0]))) * 2 : (shape.radius || entity.radius || 9) * 2);
                const depth = shape.depth || (shape.points ? Math.max(1, ...shape.points.map(p => Math.abs(p[1]))) * 2 : width), angle = entity.angle || 0, elevation = shape.elevation ?? 24;
                const opacity = shape.opacity ?? 0.85;
                if (!(width > 0 && depth > 0 && elevation > 0 && opacity > 0) || !Number.isFinite(width + depth + angle + elevation + opacity)) return;
                const pointsKey = shape.points ? shape.points.flat().join(',') : null;
                if (e.pointsKey !== pointsKey) e.revision++;
                e.pointsKey = pointsKey;
                if (e.x !== x || e.y !== y || e.angle !== angle || e.width !== width || e.depth !== depth || e.kind !== kind || e.elevation !== elevation || e.opacity !== opacity || e.points !== shape.points || e.door !== shape.door || e.fullBlocker !== !!shape.fullBlocker) e.revision++;
                Object.assign(e, { x, y, angle, width, depth, kind, elevation, opacity, points: shape.points, door: shape.door, fullBlocker: !!shape.fullBlocker, frame: this.frame });
                const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
                const ex = (c * width + s * depth) / 2, ey = (s * width + c * depth) / 2, C = DYNAMIC_SHADOW.CELL;
                for (let bx = Math.floor((x - ex) / C); bx <= Math.floor((x + ex) / C); bx++) for (let by = Math.floor((y - ey) / C); by <= Math.floor((y + ey) / C); by++) {
                    const key = bx + ',' + by;
                    let cell = this.cells.get(key); if (!cell) this.cells.set(key, cell = []);
                    cell.push(e);
                }
                this.casters.push(e); this.stats.casters++;
            },
            noteHuman(e) { this.note(e, { kind: 'human', width: 18, depth: 18, elevation: 24 }); },
            noteVehicle(e) { this.note(e, { kind: 'box', width: e.length, depth: e.vehicleWidth || e.width, elevation: 15 }); },
            noteProp(e) {
                if (!e.hasCollision || e.noNav) return;
                this.note(e, { kind: 'box', dx: e.width / 2, dy: e.height / 2, width: e.width, depth: e.height, elevation: Math.min(24, Math.max(6, Math.min(e.width, e.height) * 0.5)) });
            },
            noteDoor(door) {
                if (door.type === 'arch' || typeof door.leaves !== 'function') return;
                let entries = this.doorLeaves.get(door);
                if (!entries) this.doorLeaves.set(door, entries = []);
                const leaves = door.leaves();
                for (let i = 0; i < leaves.length; i++) {
                    const L = leaves[i], dx = L[2] - L[0], dy = L[3] - L[1];
                    const e = entries[i] || (entries[i] = {});
                    Object.assign(e, { x: (L[0] + L[2]) / 2, y: (L[1] + L[3]) / 2, angle: Math.atan2(dy, dx) });
                    const before = this.casters.length;
                    this.note(e, { kind: 'box', width: Math.hypot(dx, dy), depth: Math.max(2, (door.halfThick || 3) * 2), elevation: door.shadowElevation || 40,
                        opacity: door.shadowOpacity ?? (door.type === 'sliding' ? 0.35 : 1), fullBlocker: true, door });
                    if (this.casters.length > before) this.stats.doors++;
                }
            },
            source(owner, family, description) {
                let byKind = this.sources.get(owner);
                if (!byKind) this.sources.set(owner, byKind = new Map());
                let light = byKind.get(family);
                if (!light) byKind.set(family, light = { dynamic: true, family, owner });
                Object.assign(light, description); light.family = description.family || family; light.seen = this.frame;
                return light;
            },
            _doorBlocked(light, x, y, ignore) {
                const rs = this.engine.roomSystem;
                if (!rs || !rs.active) return false;
                let physical = false;
                for (const d of rs.doors || []) {
                    if (typeof d.leaves !== 'function') continue;
                    physical = true;
                    if (d === ignore || d.type === 'arch' || (d.shadowOpacity ?? (d.type === 'sliding' ? 0.35 : 1)) < 0.95) continue;
                    for (const L of d.leaves()) if (segmentsCross(light.x, light.y, x, y, ...L)) return true;
                }
                return !physical && typeof rs.doorBlocks === 'function' && rs.doorBlocks(light.x, light.y, x, y);
            },
            _staticReachable(light, x, y) {
                this.stats.rays++;
                if (light.noWorldWalls) {
                    for (const s of light.segments || []) if (segmentsCross(light.x, light.y, x, y, s.x1, s.y1, s.x2, s.y2)) return false;
                    return true;
                }
                const obstacles = getOccluders(this.map);
                const candidates = _physicsSpatial.query(obstacles, { left: Math.min(light.x, x), right: Math.max(light.x, x), top: Math.min(light.y, y), bottom: Math.max(light.y, y) });
                for (const o of candidates) if (o && segCrossesRect(light.x, light.y, x, y, o.x, o.y, o.w ?? o.width, o.h ?? o.height)) return false;
                return true;
            },
            reachable(light, x, y, ignoreDoor) { return this._staticReachable(light, x, y) && !this._doorBlocked(light, x, y, ignoreDoor); },
            wantsSilhouette(e, config) {
                if ((this.quality !== 'high' && this.quality !== 'gamma') || config._crowdBake || config.isDriving || config.noShadow || e._reflectionProxy || _zoomLOD >= 2 || !this.map || !this.visible) return false;
                if (this._captureCount >= DYNAMIC_SHADOW.MAX_CAPTURES) return false;
                const key = JSON.stringify([config.body, config.hair, config.top, config.bottom, config.shoes, config.hat, config.weapon, config.pose, config.stance]);
                const keep = this.keeps.get(e), moving = e._gait && e._gait.speed > CONFIG.GAIT.STOP_SPEED;
                if (keep && keep.key === key && keep.angle === e.angle && _frameTime - keep.at < (moving ? 100 : 1000)) return false;
                const lights = [...(this.engine.lamps || []), ...[...this.lights.keys()].filter(l => l.dynamic && l.seen >= this.frame - 1 && (l.elevation ?? 84) > 24)];
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
            _inside(e, x, y) {
                const c = Math.cos(e.angle), s = Math.sin(e.angle), dx = x - e.x, dy = y - e.y;
                const lx = dx * c + dy * s, ly = -dx * s + dy * c;
                if (e.kind === 'box') return Math.abs(lx) < e.width / 2 && Math.abs(ly) < e.depth / 2;
                if (!e.points) return (lx / (e.width / 2)) ** 2 + (ly / (e.depth / 2)) ** 2 < 1;
                let inside = false;
                for (let i = 0, j = e.points.length - 1; i < e.points.length; j = i++) {
                    const a = e.points[i], b = e.points[j];
                    if ((a[1] > ly) !== (b[1] > ly) && lx < (b[0] - a[0]) * (ly - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
                }
                return inside;
            },
            _pairs(light, s, policy) {
                const candidates = [], seen = new Set(), R = light.radius, C = DYNAMIC_SHADOW.CELL;
                light.segmentKey = light.noWorldWalls ? (light.segments || []).map(s => [s.x1, s.y1, s.x2, s.y2].join(',')).join(';') : '';
                for (let bx = Math.floor((light.x - R) / C); bx <= Math.floor((light.x + R) / C); bx++) for (let by = Math.floor((light.y - R) / C); by <= Math.floor((light.y + R) / C); by++) {
                    const cell = this.cells.get(bx + ',' + by);
                    if (cell) for (const e of cell) {
                        if (seen.has(e)) continue; seen.add(e);
                        const d = Math.hypot(e.x - light.x, e.y - light.y);
                        if ((!light.acceptCaster || light.acceptCaster(e)) && e.entity !== light.owner && d > 0.001 && !this._inside(e, light.x, light.y) && d < R + Math.hypot(e.width, e.depth) / 2) candidates.push({ e, d });
                    }
                }
                candidates.sort((a, b) => a.d - b.d || a.e.id - b.e.id);
                const out = [], present = new Set();
                for (let i = 0; i < candidates.length; i++) {
                    if (out.length >= policy.perLight) { this.stats.dropped += candidates.length - i; break; }
                    const { e, d } = candidates[i];
                    present.add(e);
                    let p = s.pairs.get(e);
                    if (!p || p.revision !== e.revision || p.geometry !== this.wallRevision || p.lx !== light.x || p.ly !== light.y || p.radius !== R || p.segmentKey !== light.segmentKey) {
                        p = { e, d, revision: e.revision, geometry: this.wallRevision, lx: light.x, ly: light.y, radius: R, segmentKey: light.segmentKey, staticVisible: this._staticReachable(light, e.x, e.y) };
                        s.pairs.set(e, p);
                    }
                    p.visible = p.staticVisible && !this._doorBlocked(light, e.x, e.y, e.door);
                    if (!p.visible) { this.stats.blocked++; continue; }
                    if (out.length >= policy.perLight) { this.stats.dropped++; continue; }
                    out.push(p);
                }
                for (const e of s.pairs.keys()) if (!present.has(e)) s.pairs.delete(e);
                return out;
            },
            _path(light, s) {
                if (light.clipPath) return light.clipPath;
                if (light.noWorldWalls) {
                    const p = new Path2D(), b = light.bounds || { x: light.x - light.radius, y: light.y - light.radius, w: light.radius * 2, h: light.radius * 2 };
                    p.rect(b.x, b.y, b.w, b.h); return p;
                }
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
                const full = e.fullBlocker || (this.quality === 'ultra' || this.quality === 'beta') || (light.elevation !== undefined && light.elevation <= e.elevation);
                const len = Math.min(policy.reach, Math.max(0, light.radius - d), d * slope);
                const keep = this.quality === 'low' ? null : this.keeps.get(e.entity);
                g.save(); g.globalAlpha = Math.max(0, Math.min(1, e.opacity));
                if (keep && keep.m && keep.angle === e.angle && !full) {
                    const D = CONFIG.HUMAN_SHADE.LAMP_SHADOW_DEPTH;
                    g.translate(e.x, e.y); g.rotate(ang); g.translate(-D / 2, 0); g.scale((D + len) / D, 1); g.translate(D / 2, 0);
                    g.rotate(-ang); g.translate(-keep.x, -keep.y);
                    const m = keep.m; g.transform(m.a, m.b, m.c, m.d, m.e, m.f); g.drawImage(keep.cv, 0, 0);
                } else if (!full && this.quality === 'low' && e.kind !== 'box' && e.kind !== 'polygon') {
                    g.translate(e.x, e.y); g.rotate(ang);
                    g.drawImage(this._white || (this._white = glowSprite('255, 255, 255', 0.55)), -e.width / 2, -e.depth / 2, e.width + len, e.depth);
                } else {
                    const local = e.points || (e.kind === 'box' ? [[-e.width / 2, -e.depth / 2], [e.width / 2, -e.depth / 2], [e.width / 2, e.depth / 2], [-e.width / 2, e.depth / 2]]
                        : Array.from({ length: 12 }, (_, i) => [Math.cos(i * Math.PI / 6) * e.width / 2, Math.sin(i * Math.PI / 6) * e.depth / 2]));
                    const c = Math.cos(e.angle), s = Math.sin(e.angle), points = [];
                    const scale = full ? Math.max(1, light.radius / d) : 1 + len / d;
                    for (const p of local) {
                        const x = e.x + p[0] * c - p[1] * s, y = e.y + p[0] * s + p[1] * c;
                        const projection = full ? Math.max(1, light.radius / Math.max(0.001, Math.hypot(x - light.x, y - light.y))) : scale;
                        points.push([x, y], [light.x + (x - light.x) * projection, light.y + (y - light.y) * projection]);
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
                if (keep && keep.m && keep.angle === e.angle && this.quality !== 'ultra' && this.quality !== 'beta') {
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
                const family = light.family || 'lamp', limit = family === 'lamp' ? policy.maxLights : policy.otherLights;
                if (this._shadowLightCount >= policy.maxSources || (this._families[family] || 0) >= limit) { s.pairs.clear(); this.stats.dropped++; return null; }
                const pairs = this._pairs(light, s, policy); this.stats.pairs += pairs.length;
                if (!pairs.length) { if (s.bytes) { this.bytes -= s.bytes; s.bytes = 0; s.hole = s.color = null; } s.signature = null; return null; }
                this._shadowLightCount++; this._families[family] = (this._families[family] || 0) + 1; this.stats.sources++; s.maskUsed = this.frame;
                const path = this._path(light, s), R = light.radius;
                const bounds = light.bounds || { x: light.x - R, y: light.y - R, w: R * 2, h: R * 2 };
                if (!(bounds.w > 0 && bounds.h > 0) || !Number.isFinite(bounds.x + bounds.y + bounds.w + bounds.h)) return null;
                const scale = Math.min(policy.density, policy.side / Math.max(bounds.w, bounds.h));
                const width = Math.max(16, Math.ceil(bounds.w * scale)), height = Math.max(16, Math.ceil(bounds.h * scale));
                const signature = [light.x, light.y, light.radius, light.elevation, light.color, light.style, light.segmentKey, light.samePaint, light.noWorldWalls, this.wallRevision, this.quality, bounds.x, bounds.y, bounds.w, bounds.h, width, height, ...pairs.map(p => p.e.id + ':' + p.e.revision + ':' + (this.keeps.get(p.e.entity)?.revision || 0))].join('|');
                if (signature === s.signature && s.baseRef === light.baseRef && s.clipRef === light.clipPath && s.hole) { this.stats.hits++; s.ready = true; return s; }
                const bytes = width * height * (light.samePaint ? 4 : 8);
                while (this.bytes - s.bytes + bytes > DYNAMIC_SHADOW.MAX_BYTES) {
                    let oldest = null;
                    for (const [l, cached] of this.lights) if (cached !== s && cached.bytes && (cached.maskUsed || 0) < this.frame && (!oldest || (cached.maskUsed || 0) < (oldest[1].maskUsed || 0))) oldest = [l, cached];
                    if (!oldest) { this.stats.dropped += pairs.length; return null; }
                    this.bytes -= oldest[1].bytes; this.lights.delete(oldest[0]);
                }
                this.bytes += bytes - s.bytes; s.bytes = bytes;
                const mask = this._mask || (this._mask = document.createElement('canvas')); mask.width = width; mask.height = height;
                const mg = mask.getContext('2d'), x = bounds.x, y = bounds.y, sx = width / bounds.w, sy = height / bounds.h;
                const casterMask = this._casterMask || (this._casterMask = document.createElement('canvas'));
                casterMask.width = width; casterMask.height = height;
                const cg = casterMask.getContext('2d');
                for (const p of pairs) {
                    cg.setTransform(1, 0, 0, 1, 0, 0); cg.clearRect(0, 0, width, height);
                    cg.setTransform(sx, 0, 0, sy, -x * sx, -y * sy);
                    this._cast(cg, light, p, policy); this._base(cg, p.e);
                    mg.drawImage(casterMask, 0, 0);
                }
                if (!light.samePaint && s.color === s.hole) s.color = null;
                for (const mode of light.samePaint ? ['hole'] : ['hole', 'color']) {
                    const cv = s[mode] || (s[mode] = document.createElement('canvas')); cv.width = width; cv.height = height;
                    const g = cv.getContext('2d'); g.setTransform(sx, 0, 0, sy, -x * sx, -y * sy);
                    g.save(); g.clip(path);
                    if (light.paint) light.paint(g, mode);
                    else {
                    const grad = g.createRadialGradient(light.x, light.y, mode === 'hole' ? Math.min(10, R * 0.1) : 0, light.x, light.y, R);
                    if (mode === 'hole') { grad.addColorStop(0, '#fff'); grad.addColorStop(1, 'rgba(255,255,255,0)'); }
                    else { grad.addColorStop(0, '#fff'); grad.addColorStop(0.1, light.color || '#fff'); grad.addColorStop(0.6, light.color || '#fff'); grad.addColorStop(1, 'rgba(0,0,0,0)'); }
                    g.fillStyle = grad; g.fillRect(x, y, R * 2, R * 2);
                    } g.restore();
                    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-out'; g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'source-over';
                }
                if (light.samePaint) s.color = s.hole;
                Object.assign(s, { signature, x, y, size: R * 2, w: bounds.w, h: bounds.h, baseRef: light.baseRef, clipRef: light.clipPath, ready: true }); this.stats.builds++;
                return s;
            },
            visibilityPath(light) {
                if (!this.map || this.quality === 'off' || !(light.radius > 0) || !Number.isFinite(light.x + light.y + light.radius)) return null;
                return this._path(light, this._state(light));
            },
            drawLight(ctx, light, mode) {
                const s = this.prepare(light);
                if (!s) return false;
                if (GammaShadows.collect(ctx, s, mode)) return true;
                ctx.drawImage(s[mode], s.x, s.y, s.w, s.h);
                return true;
            }
        };
