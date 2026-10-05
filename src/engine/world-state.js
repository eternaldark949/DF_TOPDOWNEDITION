        // GameEngine — Emissive pass, debug views, transitions, vehicles, visibility, time of day, darkness, landmarks.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        engineMixin({
            /** The interact pill (ui/action-dock.js): a verb and what it's for (E on desktop). */
            setInteract(verb, name) { setActionPill(this.interactBtn, verb, name, 'E'); },

            /**
             * Laser sight geometry for this frame: from the drawn muzzle along the line the
             * next shot will fly (same aimFromMuzzle call as fireWeapon), clipped at the
             * first wall. Null when the sight shouldn't show (no attachment, holstered,
             * driving, no weapon drawn). Cached per frame for the world and light passes.
             */
            getLaserSight() {
                const key = _simTick + ':' + RenderInterp.alpha + ':' + this.player.x + ':' + this.player.y + ':' + this.player.angle;
                if (this._laserKey === key) return this._laserGeom;
                this._laserKey = key;
                this._laserGeom = null;
                const attach = this.inventory.getEquippedAttachment();
                if (attach?.effect !== 'laser_sight' || !this.player.visible || this.isDriving) return null;
                if (!(this.weaponMode === 'normal' || this.weaponMode === 'sniper') || this.weaponHolstered) return null;
                if (!this.player._muzzleLocal || !this.player._muzzleReady) return null;
                const ap = this.player._aimPoint;
                const shot = aimFromMuzzle(this.player, this.player.angle, ap ? ap.x : undefined, ap ? ap.y : undefined);
                const beamLength = 300;
                const ex = shot.x + Math.cos(shot.angle) * beamLength, ey = shot.y + Math.sin(shot.angle) * beamLength;
                const hitD = raycastNearest(shot.x, shot.y, ex, ey, [...(this.activeMap.walls || []), ...getColliders(this.activeMap)], beamLength);
                this._laserGeom = { x0: shot.x, y0: shot.y, x1: shot.x + Math.cos(shot.angle) * hitD, y1: shot.y + Math.sin(shot.angle) * hitD, angle: shot.angle };
                return this._laserGeom;
            },

            // Buildings/foliage are authored on loadMap and static during play. Editors/runtime
            // geometry edits (including same-length replacements/reorders) must invalidate once
            // AFTER their batch of changes. Array identity/length changes are also detected below.
            invalidateRenderSpatial(map = this.activeMap) {
                if (map) map._renderSpatialRevision = (map._renderSpatialRevision || 0) + 1;
                this._renderBuildingLists = null;
            },

            _clearRenderSpatial() {
                this._renderSpatialMap = null; this._renderSpatialRevision = -1;
                this._renderBuildingSource = null; this._renderFoliageSource = null;
                this._orderedBuildings = null; this._orderedFoliage = null;
                this._renderBuildingLists = null; this._renderBuildingListsStorage = null;
                this._forecourtCandidates = null; this._foliageCandidates = null;
                this._sunBuildingCandidates = null; this._sunFoliageCandidates = null;
            },

            _ensureRenderSpatial() {
                const map = this.activeMap, revision = map._renderSpatialRevision || 0;
                const buildings = map.buildings, foliage = map.foliage;
                if (this._renderSpatialMap === map && this._renderSpatialRevision === revision &&
                    this._renderBuildingSource === buildings && this._renderBuildingLength === (buildings ? buildings.length : 0) &&
                    this._renderFoliageSource === foliage && this._renderFoliageLength === (foliage ? foliage.length : 0)) return;
                this._renderSpatialMap = map; this._renderSpatialRevision = revision;
                this._renderBuildingSource = buildings; this._renderBuildingLength = buildings ? buildings.length : 0;
                this._renderFoliageSource = foliage; this._renderFoliageLength = foliage ? foliage.length : 0;
                this._renderBuildingLists = null;
                const bg = this._orderedBuildings || (this._orderedBuildings = new OrderedRenderGrid());
                const fg = this._orderedFoliage || (this._orderedFoliage = new OrderedRenderGrid());
                this._renderBuildingMaxFloors = 0; this._renderBuildingMaxReach = 0;
                bg.build(buildings, (b, entry) => {
                    entry.standardV2 = !!(b.isV2 && b.inView === BuildingV2.prototype.inView && b._leanScale === BuildingV2.prototype._leanScale);
                    // Missing/nonfinite dimensions can pass the legacy shadow/forecourt
                    // predicates differently from the base pass's 200px fallback; keep them live.
                    if (![b.x, b.y, b.w, b.h].every(Number.isFinite)) return null;
                    // Unknown visibility implementations retain their original per-pass checks.
                    if (b.isV2 && (!entry.standardV2 || !Number.isFinite(b.floors) || b.floors < 0 ||
                        !Number.isFinite(b.emissiveReach || 0))) return null;
                    if (entry.standardV2) {
                        this._renderBuildingMaxFloors = Math.max(this._renderBuildingMaxFloors, b.floors);
                        this._renderBuildingMaxReach = Math.max(this._renderBuildingMaxReach, b.emissiveReach || 0);
                    }
                    return { left: b.x, right: b.x + (b.w || 200), top: b.y, bottom: b.y + (b.h || 200) };
                });
                fg.build(foliage, f => {
                    // Include the anchor as well as a generous canopy envelope. The original
                    // anchor predicate remains final, including for oversized editor trees.
                    const s = Math.abs(f.size || 1), r = 80 * Math.max(1, s), cy = foliageCanopyY(f);
                    return { left: f.x - r, right: f.x + r, top: Math.min(f.y, cy - r), bottom: Math.max(f.y, cy + r) };
                });
            },

            _queryRenderBuildings(bounds, results) {
                this._ensureRenderSpatial();
                return this._orderedBuildings.query(bounds, results);
            },

            _queryRenderFoliage(bounds, results) {
                this._ensureRenderSpatial();
                return this._orderedFoliage.query(bounds, results);
            },

            _prepareRenderBuildingLists(bounds) {
                this._ensureRenderSpatial();
                const cam = this.camera, B = CONFIG.BUILDINGS, C = CONFIG.CULLING;
                let lists = this._renderBuildingLists;
                // Cache only this draw's view. Subsequent calls also catch explicit geometry
                // invalidation and map/collection replacements through _ensureRenderSpatial.
                if (lists && lists.frame === this._renderDrawId && lists.bounds === bounds &&
                    lists.camX === cam.x && lists.camY === cam.y && lists.zoom === cam.zoom &&
                    lists.lean === B.LEAN && lists.camHeight === B.CAM_HEIGHT && lists.refZoom === B.REF_ZOOM &&
                    lists.floorHeight === B.FLOOR_HEIGHT && lists.maxFloors === B.MAX_FLOORS &&
                    lists.extra === C.LEAN_EXTRA && lists.margin === C.BUILDINGS_VIEW) return lists;
                lists = this._renderBuildingListsStorage || (this._renderBuildingListsStorage = { base: [], v2: [], candidates: [] });
                lists.base.length = 0; lists.v2.length = 0;
                lists.frame = this._renderDrawId; lists.bounds = bounds; lists.camX = cam.x; lists.camY = cam.y; lists.zoom = cam.zoom;
                lists.lean = B.LEAN; lists.camHeight = B.CAM_HEIGHT; lists.refZoom = B.REF_ZOOM;
                lists.floorHeight = B.FLOOR_HEIGHT; lists.maxFloors = B.MAX_FLOORS; lists.extra = C.LEAN_EXTRA; lists.margin = C.BUILDINGS_VIEW;
                const V = bounds.view, cb = bounds.buildings;
                let query = null, k = 1;
                const pad = Math.max(0, this._renderBuildingMaxReach + C.BUILDINGS_VIEW);
                let safe = [cam.x, cam.y, V.left, V.right, V.top, V.bottom, pad].every(Number.isFinite);
                if (B.LEAN) {
                    const h = (Math.min(this._renderBuildingMaxFloors, B.MAX_FLOORS) + C.LEAN_EXTRA) * B.FLOOR_HEIGHT;
                    const cameraHeight = leanCamHeight();
                    safe = safe && Number.isFinite(h) && h >= 0 && Number.isFinite(cameraHeight) && cameraHeight > h &&
                        Number.isFinite(B.MAX_FLOORS) && B.MAX_FLOORS >= 0 && Number.isFinite(C.LEAN_EXTRA) && C.LEAN_EXTRA >= 0 &&
                        Number.isFinite(B.FLOOR_HEIGHT) && B.FLOOR_HEIGHT >= 0;
                    if (safe) k = 1 + h / (cameraHeight - h);
                }
                if (safe) {
                    // A projected roof is cam + (footprint - cam) * k. Inverse-project the
                    // padded view at the largest k and union it with k=1 and legacy bounds.
                    // Every intermediate roof/wall scale is covered, even when V is offset
                    // by cinematic pan, shake or a finisher independently of the lean camera.
                    const left = V.left - pad, right = V.right + pad, top = V.top - pad, bottom = V.bottom + pad;
                    query = { left: Math.min(cb.left, left, cam.x + (left - cam.x) / k),
                        right: Math.max(cb.right, right, cam.x + (right - cam.x) / k),
                        top: Math.min(cb.top, top, cam.y + (top - cam.y) / k),
                        bottom: Math.max(cb.bottom, bottom, cam.y + (bottom - cam.y) / k) };
                    // Broadphase roundoff may only add candidates, including at cell boundaries.
                    const guard = 32 * Number.EPSILON * Math.max(1, Math.abs(cam.x), Math.abs(cam.y),
                        Math.abs(query.left), Math.abs(query.right), Math.abs(query.top), Math.abs(query.bottom));
                    query.left -= guard; query.right += guard; query.top -= guard; query.bottom += guard;
                }
                // A singular/unusual projection takes the original full candidate scan.
                const candidates = this._orderedBuildings.query(query, lists.candidates);
                for (const entry of candidates) {
                    const b = entry.item;
                    if (entry.standardV2) {
                        if (b.inView(V, cam)) { lists.base.push(entry); lists.v2.push(entry); }
                    } else {
                        if (b.isV2) lists.v2.push(entry);
                        if (b.isV2 && b.inView) lists.base.push(entry); // custom predicate runs at its original base pass
                        else if (!(b.x + (b.w || 200) < cb.left || b.x > cb.right || b.y + (b.h || 200) < cb.top || b.y > cb.bottom)) lists.base.push(entry);
                    }
                }
                this._renderBuildingLists = lists;
                return lists;
            },

            /** After lighting: building windows/neon/rooftop lights, then the sky layer. */
            drawEmissivePass(ctx) {
                const dark = this.getAmbientDarkness();
                const art = INTERIOR_ART[this.activeMap.id];
                if (art && art.glow) art.glow(this, ctx);
                if (CONFIG.BUILDINGS.LEAN && this.activeMap.buildings) {
                    const V = this._cullBounds && this._cullBounds.view;
                    const z = this.camera.zoom || 1;
                    const hw = this.canvas.width / 2 / z + 200, hh = this.canvas.height / 2 / z + 200;
                    if (V) {
                        const visible = this._prepareRenderBuildingLists(this._cullBounds).v2;
                        for (const entry of visible) {
                            const b = entry.item;
                            if (!b.isV2 || !b.drawEmissive) continue;
                            if (!entry.standardV2 && !b.inView(V, this.camera)) continue;
                            b.drawEmissive(ctx, dark);
                        }
                    } else {
                        // Standalone calls without a draw view retain their original fallback predicate.
                        for (const b of this.activeMap.buildings) {
                            if (!b.isV2 || !b.drawEmissive) continue;
                            const m = b.emissiveReach || 0;
                            if (b.x + b.w < this.camera.x - hw - m || b.x > this.camera.x + hw + m || b.y + b.h < this.camera.y - hh - m || b.y > this.camera.y + hh + m) continue;
                            b.drawEmissive(ctx, dark);
                        }
                    }
                }
                // Car lamps in the dark: tail and brake lights, headlights, signals (traffic/car-art.js)
                if (dark > 0.04) {
                    const z = this.camera.zoom || 1, hw = this.canvas.width / 2 / z + 60, hh = this.canvas.height / 2 / z + 60, c = this.camera;
                    const cars = new Set(this.traffic ? this.traffic.vehicles : []);
                    for (const v of [this.car, this.ownedCar, this.deliveryVehicle]) if (v && v.draw === TrafficVehicle.prototype.draw) cars.add(v);
                    for (const v of cars) {
                        if (!v.visible || v.dead || v.x < c.x - hw || v.x > c.x + hw || v.y < c.y - hh || v.y > c.y + hh) continue;
                        drawCarGlow(ctx, v, dark);
                    }
                }
                if (this.activeMap.billboards) {
                    const z = this.camera.zoom || 1, hw = this.canvas.width / 2 / z + 250, hh = this.canvas.height / 2 / z + 250, c = this.camera;
                    for (const bb of this.activeMap.billboards) if (bb.inView({ left: c.x - hw, right: c.x + hw, top: c.y - hh, bottom: c.y + hh })) bb.drawEmissive(ctx, dark);
                }
                if (this.activeMap.type === 'outdoor') {
                    if (!this.skyLayer || this.skyLayer.map !== this.activeMap) this.skyLayer = new SkyLayer(this.activeMap);
                    this.skyLayer.draw(ctx, this.camera, this.canvas, dark);
                }
            },

            /** Debug overlay: blocked nav cells in view, companion paths, spots and shot lines. */
            drawNavDebug(ctx) {
                const nav = NavGrid.for(this.activeMap);
                if (!nav) return;
                const z = this.camera.zoom || 1;
                const halfW = this.canvas.width / 2 / z, halfH = this.canvas.height / 2 / z;
                const c = nav.cell;
                const c0 = Math.max(0, nav.colOf(this.camera.x - halfW)), c1 = Math.min(nav.cols - 1, nav.colOf(this.camera.x + halfW));
                const r0 = Math.max(0, nav.rowOf(this.camera.y - halfH)), r1 = Math.min(nav.rows - 1, nav.rowOf(this.camera.y + halfH));
                ctx.save();
                ctx.fillStyle = 'rgba(40, 120, 255, 0.28)';   // blue reads against the city's reds and pinks
                for (let row = r0; row <= r1; row++) {
                    for (let col = c0; col <= c1; col++) {
                        if (nav.blocked[row * nav.cols + col]) ctx.fillRect(col * c, row * c, c, c);
                    }
                }
                for (const tm of this.teammates) {
                    if (!tm.recruited || tm.inCar) continue;
                    const st = tm._navPath;
                    if (st && st.pts) {
                        ctx.strokeStyle = 'rgba(0, 220, 255, 0.9)'; ctx.lineWidth = 2;
                        ctx.beginPath(); ctx.moveTo(tm.x, tm.y);
                        for (let i = st.idx; i < st.pts.length; i++) ctx.lineTo(st.pts[i].x, st.pts[i].y);
                        ctx.stroke();
                    }
                    const tac = tm._tac;
                    if (tac && tac.spot) {
                        ctx.strokeStyle = 'rgba(255, 220, 0, 0.95)'; ctx.lineWidth = 2;
                        ctx.beginPath(); ctx.arc(tac.spot.x, tac.spot.y, 10, 0, Math.PI * 2); ctx.stroke();
                        if (tac.target && !tac.target.dead) {
                            ctx.strokeStyle = hasShotLine(tac.spot.x, tac.spot.y, tac.target.x, tac.target.y, this.activeMap)
                                ? 'rgba(80, 255, 120, 0.8)' : 'rgba(255, 80, 80, 0.8)';
                            ctx.setLineDash([6, 6]);
                            ctx.beginPath(); ctx.moveTo(tac.spot.x, tac.spot.y); ctx.lineTo(tac.target.x, tac.target.y); ctx.stroke();
                            ctx.setLineDash([]);
                        }
                    }
                }
                ctx.restore();
            },

            drawDebugLighting(ctx) {
                // If there is no data (because bake hasn't run), do nothing
                if (!this.debugLightData) return;

                ctx.save();
                ctx.lineWidth = 1;

                for (let light of this.debugLightData) {
                    // Draw Rays (The "Angles") - Faint White
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                    ctx.beginPath();
                    for (let p of light.points) {
                        ctx.moveTo(light.source.x, light.source.y);
                        ctx.lineTo(p.x, p.y);
                    }
                    ctx.stroke();

                    // Draw Polygon Outline (The "Shadows") - Bright White
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                    ctx.beginPath();
                    if (light.points.length > 0) {
                        ctx.moveTo(light.points[0].x, light.points[0].y);
                        for (let i = 1; i < light.points.length; i++) {
                            ctx.lineTo(light.points[i].x, light.points[i].y);
                        }
                        ctx.closePath();
                    }
                    ctx.stroke();
                    
                    // Draw Light Source Center
                    ctx.fillStyle = '#00f3ff';
                    ctx.fillRect(light.source.x - 2, light.source.y - 2, 4, 4);
                }
                ctx.restore();
            },

            triggerTransition() {
                if (!this.activeMap.transitions) return;
                
                // Find which transition zone the player is standing in
                const t = this._transitionGrid.query(this.player.x, this.player.y);
                
                if (t && t.target) {
                    const displayNames = {
                        'apt_949': "SILVER QUEEN APARTMENTS",
                        'medbay_sw': "DR. YIN'S CLINIC",
                        'moon_city_nightclub': "MOON CITY NIGHTCLUB",
                        'hotel_lobby': "DOUBLE NIGHTS HOTEL",
                        'hotel_suite': "PENTHOUSE SUITE",
                        'church_boss': "THE SANCTUM",
                        'hub_949': "CITY SECTOR 9",
                        'auto_shop': "TORQUE AUTO",
                        'neural_sys_interior': "NEURAL SYSTEMS",
                        'biggs_arena': "BIGGS AMUSEMENT PARK",
                        'house_of_death': 'THE HOUSE OF DEATH',
                        'demoness_palace': 'THE DEMONESS PALACE'
                    };
            
                    const locName = displayNames[t.target] || "UNKNOWN LOCATION";
                    
                    // --- SECURITY CHECKS ---
                    // Prevent entering the Suite without a keycard
                    if (t.target === 'hotel_suite' && this.activeMap.id === 'hotel_lobby' && !this.questState.hasKeycard) {
                        showMessage("ACCESS DENIED. VIP KEYCARD REQUIRED.");
                        return;
                    }
                    
                    // --- FLAVOR TEXT ---
                    if (t.target === 'hotel_lobby' && this.activeMap.id === 'hotel_suite') {
                        showMessage("GOING DOWN...");
                    } else if (this.activeMap.id === 'church_boss') {
                        showMessage("RETURNING TO REALITY...");
                    } else {
                        // Standard Entry/Exit message
                        const action = this.activeMap.type === 'indoor' ? "EXITING TO" : "ENTERING";
                        showMessage(`${action} ${locName}...`);
                    }
            
                    // --- EXECUTE TRANSITION (With Dynamic Linking) ---
                    // by passing 'linkFrom: this.activeMap.id', the loader will:
                    // 1. Load the new map (t.target)
                    // 2. Look for a door/elevator/portal in that map that points BACK to where we came from
                    // 3. Spawn the player exactly at that point
                    this.loadMap(t.target, { linkFrom: this.activeMap.id });
                }
            },

            toggleVehicle() {
                if (this.activeMap.type === 'indoor') { showMessage("CANNOT USE VEHICLE INDOORS."); return; }
                
                // Zib passenger exit — charge partial fare and exit cleanly
                if (this.isDriving && this.zibSystem && this.zibSystem.isPassenger) {
                    this.zibSystem.exitEarly(this);
                    this.setInteract('Drive', 'Car');
                    return;
                }
                
                if (this.isDriving) {
                    // --- EXITING VEHICLE ---
                    this.isDriving = false; 
                    this.player.visible = true;
                    this.car.visible = true; 
                    this.car.hasDriver = false; 
                    this.car.alliance = null; // Clear friendly protection
                    
                    // Cat exits with player
                    if (this.velvetCat && this.questState.hasVelvetCat) {
                        this.velvetCat.inCar = false;
                        this.velvetCat.visible = true;
                    }
                    
                    // Add hijacked car back to traffic
                    if (this.car !== this.ownedCar && !this.traffic.vehicles.includes(this.car)) {
                        this.traffic.vehicles.push(this.car);
                    }
                    if (this.car === this.ownedCar) this.ownedCar.markerTargetOpacity = 1.0;

                    this.autodriveBtn.style.display = 'none';
                    this.autodriveBtn.classList.remove('engaged');
                    if (this.handbrakeBtn) { this.handbrakeBtn.style.display = 'none'; this.handbrakeBtn.classList.remove('held'); }
                    this.handbrakeHeld = false; this.car.handbrake = false;
                    this.holsterBtn.style.display = 'flex'; { const sb = document.getElementById('btn-sneak'); if (sb) sb.style.display = 'flex'; }
                    this.fireBtn.style.display = this.weaponHolstered ? 'none' : 'flex';
                    this.emoteBtn.style.display = this.weaponHolstered ? 'flex' : 'none';
                    if (this.car.controlMode === 'AI') this.car.disableAutoDrive();
                    if (this.car.clearSeats) this.car.clearSeats();
                    
                    // --- SIDE EXIT STRATEGY ---
                    const exitDist = this.car.width / 2 + 25; 
                    const cos = Math.cos(this.car.angle);
                    const sin = Math.sin(this.car.angle);
                    
                    const leftX = this.car.x + (Math.sin(this.car.angle) * exitDist);
                    const leftY = this.car.y - (Math.cos(this.car.angle) * exitDist);
                    const rightX = this.car.x - (Math.sin(this.car.angle) * exitDist);
                    const rightY = this.car.y + (Math.cos(this.car.angle) * exitDist);

                    const isBlocked = (x, y) => {
                        for(let w of this.activeMap.walls) {
                            if(x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
                        }
                        const colliders = getColliders(this.activeMap);
                        if (colliders) {
                            for(let b of colliders) {
                                if(x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
                            }
                        }
                        return false;
                    };

                    const leftBlocked = isBlocked(leftX, leftY);
                    const rightBlocked = isBlocked(rightX, rightY);
                    
                    let useLeft = !leftBlocked;
                    let useRight = !rightBlocked;
                    
                    if (leftBlocked && rightBlocked) {
                        this.player.x = this.car.x;
                        this.player.y = this.car.y;
                    } else {
                        const passengers = this.teammates.filter(t => t.inCar);
                        
                        if (useLeft) { this.player.x = leftX; this.player.y = leftY; } 
                        else { this.player.x = rightX; this.player.y = rightY; }
                        
                        passengers.forEach((p, i) => {
                            p.inCar = false;
                            p.seatIndex = -1;
                            const offset = (Math.floor(i/2) + 1) * 20 * (i % 2 === 0 ? -1 : 1);
                            const offsetX = cos * offset;
                            const offsetY = sin * offset;
                            let targetX, targetY;
                            
                            if (useLeft && useRight) { targetX = rightX + offsetX; targetY = rightY + offsetY; } 
                            else if (useLeft) { targetX = leftX + offsetX; targetY = leftY + offsetY; } 
                            else { targetX = rightX + offsetX; targetY = rightY + offsetY; }
                            
                            p.x = targetX; p.y = targetY;
                        });
                    }
                    
                    // Position cat near player on exit
                    if (this.velvetCat && this.questState.hasVelvetCat) {
                        this.velvetCat.x = this.player.x - 25;
                        this.velvetCat.y = this.player.y + 20;
                    }
                    
                    // Reset animation state to prevent limb splay from position jump
                    resetHumanoidAnim(this.player);
                    this.teammates.forEach(t => { if (!t.inCar) resetHumanoidAnim(t); });
                    
                    this.setInteract('Drive', 'Car');
                } else {
                    // --- ENTERING VEHICLE ---
                    this.isDriving = true; 
                    
                    // CHANGED: Player remains visible to render the "Lean Out" animation
                    this.player.visible = true; 
                    
                    this.car.visible = true; 
                    this.car.hasDriver = true; 
                    this.car.alliance = 'friendly'; // Prevent friendly projectile collisions
                    
                    // Set map bounds for boundary clamping
                    this.car._mapBounds = { w: this.activeMap.width, h: this.activeMap.height };
                    
                    if (this.car !== this.ownedCar) {
                        const idx = this.traffic.vehicles.indexOf(this.car);
                        if (idx > -1) this.traffic.vehicles.splice(idx, 1);
                    }
                    if (this.car === this.ownedCar) this.ownedCar.markerTargetOpacity = 0;

                    this.autodriveBtn.style.display = 'flex';
                    if (this.handbrakeBtn) this.handbrakeBtn.style.display = 'flex';
                    this.holsterBtn.style.display = 'none'; { const sb = document.getElementById('btn-sneak'); if (sb) sb.style.display = 'none'; }
                    this.fireBtn.style.display = 'flex';
                    this.emoteBtn.style.display = 'none';
                    this.setInteract('Exit', 'Vehicle');
                    
                    // --- SEATING LOGIC (seat assignment system) ---
                    // Driver = seat 0 (player)
                    if (this.car.seatOccupants) {
                        this.car.clearSeats();
                        this.car.seatOccupants[0] = true; // Player is driver
                    }
                    
                    this.teammates.forEach(tm => { 
                        if(tm.recruited && !tm.downed && this.car.assignPassenger) {
                            this.car.assignPassenger(tm);
                        }
                    });
                    
                    const totalWaiting = this.teammates.filter(t => t.recruited && !t.downed && !t.inCar).length;
                    if (totalWaiting > 0) {
                        showMessage("VEHICLE FULL. SOME FOLLOWERS LEFT BEHIND.");
                    }
                    
                    // Cat rides along (doesn't take a seat)
                    if (this.velvetCat && this.questState.hasVelvetCat) this.velvetCat.inCar = true;
                }
            },
            
            // Inside GameEngine class
            _refreshAutoDriveRoute() {
                const car = this.car, target = this.navDestination;
                if (!car || !target || !car.currentLane || car.currentTurnPath) return false;
                car._gpsCheckTimer = 0;
                const route = this.traffic.network.buildDrivePath(car.currentLane, car.x, car.y, target.x, target.y);
                car.plannedTurn = null;
                car.clearNavWaypoints();
                if (!route) { car.manualGas = -Math.abs(car.speed) / Math.max(1, car.maxSpeed); return false; }
                // Stop clear of a road boundary or intersection gate, with the body
                // fully on the final lane rather than hanging over its endpoint.
                const endLane = route.endLane, margin = Math.min(endLane.length / 2, car.length / 2 + 10);
                const along = clamp(endLane.getDistanceAlong(route.destination.x, route.destination.y), margin, endLane.length - margin);
                route.destination.x = endLane.start.x + endLane.ux * along;
                route.destination.y = endLane.start.y + endLane.uy * along;
                Object.assign(route.waypoints[route.waypoints.length - 1], route.destination);
                car.setNavWaypoints(route.waypoints.slice(1));
                car._driveRoute = route;
                car.navDestination = route.destination;
                if (this.zibSystem?.passengerRide?.zib === car) {
                    this.zibSystem.passengerRide.destinationX = route.destination.x;
                    this.zibSystem.passengerRide.destinationY = route.destination.y;
                }
                if (this.ui) {
                    this.ui.precisePath = route.waypoints;
                    this.ui.navPath = route.waypoints;
                    this.ui.drawablePathSegments = this.traffic.network.getDrawablePath(route.waypoints);
                    this.ui.roadLevelPath = this.ui._buildRoadLevelPath(car, this.traffic.network);
                    this.ui.lastPlayerNavPos = { x: car.x, y: car.y };
                }
                return true;
            },

            toggleAutoDrive() {
                if (!this.car || !this.isDriving) return;
                if (this.zibSystem && this.zibSystem.isPassenger) return;
                
                if (this.car.controlMode === 'AI') {
                    // Switch back to manual control
                    this.car.disableAutoDrive();
                    this.car.clearNavWaypoints();
                    this.autodriveBtn.classList.remove('engaged');
                    showMessage("AUTO-DRIVE DISENGAGED");
                    audioSys.sfx('ui');
                } else {
                    // Require a navigation destination before engaging
                    if (!this.navDestination) {
                        showMessage("SET A DESTINATION FIRST (USE MAP PIN)");
                        audioSys.sfx('ui');
                        return;
                    }
                    
                    // Try to enable auto-drive
                    const success = this.car.enableAutoDrive(this.traffic.network, this.activeMap.walls);
                    
                    if (success) {
                        this.autodriveBtn.classList.add('engaged');
                        
                        // Snap destination to nearest road point for reliable autodrive arrival
                        let driveTarget = this.navDestination;
                        if (this.traffic && this.traffic.network) {
                            const roadPt = this.traffic.network.findNearestRoadPoint(
                                this.navDestination.x, this.navDestination.y
                            );
                            if (roadPt && roadPt.distance < 300) {
                                driveTarget = { x: roadPt.x, y: roadPt.y };
                            }
                        }
                        this.navDestination = driveTarget;
                        this.car.navDestination = driveTarget;
                        
                        if (!this._refreshAutoDriveRoute()) {
                            this.car.disableAutoDrive();
                            this.car.clearNavWaypoints();
                            this.autodriveBtn.classList.remove('engaged');
                            showMessage("AUTO-DRIVE FAILED - NO DRIVABLE ROUTE");
                            return;
                        }
                        showMessage("AUTO-DRIVE: FOLLOWING NAVIGATION");
                        audioSys.sfx('ui');
                    } else {
                        showMessage("AUTO-DRIVE FAILED - ROAD BLOCKED OR TOO FAR");
                    }
                }
            },
            
            // Check if player has reached navigation destination
            checkNavArrival() {
                if (this.zibSystem && this.zibSystem.isPassenger) return;
                if (!this.navDestination) return;
                
                const driving = this.isDriving && this.car;
                const target = driving && this.car.controlMode === 'AI' && this.car.navDestination
                    ? this.car.navDestination : this.navDestination;
                const actor = driving ? this.car : this.player;
                const dist = Math.hypot(actor.x - target.x, actor.y - target.y);
                
                const autoDriving = driving && this.car.controlMode === 'AI';
                if (autoDriving && this.car.currentTurnPath) return;
                if (dist < (autoDriving ? 35 : this.navCheckDistance)) {
                    // Arrived at destination
                    showMessage("DESTINATION REACHED");
                    audioSys.sfx('ui');
                    
                    // Clear navigation
                    this.navDestination = null;
                    if (this.car) {
                        this.car.navDestination = null;
                        this.car.clearNavWaypoints(); // Clear waypoints too
                    }
                    
                    // Clear UI markers
                    if (this.ui) {
                        this.ui.navMarker = null;
                        this.ui.navPath = [];
                        this.ui.roadLevelPath = [];
                    }
                    
                    // Disable autodrive if it was following nav
                    if (this.isDriving && this.car && this.car.controlMode === 'AI') {
                        this.car.vx = this.car.vy = this.car.speed = 0;
                        this.car.disableAutoDrive();
                        this.autodriveBtn.classList.remove('engaged');
                    }
                }
            },
            
            hijackVehicle(target) {
                // 1. Handle returning to owned car
                if (target === this.ownedCar) {
                    showMessage(`WELCOME BACK TO LADY BLACKMARK V1. YOUR RIDE.`);
                    
                    // Smoothly fade out the marker
                    this.ownedCar.markerTargetOpacity = 0;
                    
                    // If we are leaving a hijacked car to get into owned car, save the hijacked car
                    if (this.car && this.car !== this.ownedCar && this.car.visible) {
                         this.car.controlMode = 'PARKED'; // Traffic cars stop instantly to save physics calc
                         this.car.driverType = null;
                         this.car.hasDriver = false;
                         // PUSH BACK TO TRAFFIC SYSTEM so it stays physical
                         this.traffic.vehicles.push(this.car);
                    }
                    
                    this.car = this.ownedCar;
                    this.toggleVehicle();
                    return;
                }
                
                // 2. Handle abandoning current car
                const oldCar = this.car;
                if (oldCar && oldCar.visible) {
                    oldCar.driverType = null;
                    oldCar.hasDriver = false;
                    
                    // If it's the Owned Car, keep it special
                    if (oldCar.isOwnedCar) {
                        // FIX: Do NOT set to 'PARKED'. Set to 'PLAYER' so it coasts using updateManualDriving physics.
                        oldCar.controlMode = 'PLAYER'; 
                        
                        // Show "YOUR CAR" marker
                        oldCar.markerTargetOpacity = 1.0; 
                    } 
                    // If it's a stolen car, give it back to the Traffic Manager
                    else {
                        // Generic cars get parked instantly to prevent runaway physics on non-critical entities
                        oldCar.controlMode = 'PARKED';
                        
                        // Check if it's already in the list to avoid duplicates
                        if (!this.traffic.vehicles.includes(oldCar)) {
                            this.traffic.vehicles.push(oldCar);
                        }
                    }
                }
                
                // 3. Take control of new target
                target.controlMode = 'PLAYER';
                target.driverType = 'player';
                target.hasDriver = true;
                this.car = target;
                
                // Set map bounds for boundary clamping
                this.car._mapBounds = { w: this.activeMap.width, h: this.activeMap.height };
                
                // Remove new target from traffic list (so AI doesn't control it)
                const idx = this.traffic.vehicles.indexOf(target);
                if (idx > -1) this.traffic.vehicles.splice(idx, 1);
                
                // If hijacking the delivery vehicle, clear its persistent slot
                // (a new one will spawn at the cafe when player returns)
                if (target.isDeliveryVehicle) {
                    this.deliveryVehicle = null; // Clear persistent ref so a new one spawns
                    showMessage(`AMBER DELIVERY VEHICLE — DRIVE CAREFULLY.`);
                }
                // Zib hijack — remove from taxi system, player takes full control
                else if (target.isZib) {
                    target.isZib = false;
                    target.driverType = 'player';
                    const zibIdx = this.zibSystem.activeZibs.indexOf(target);
                    if (zibIdx > -1) this.zibSystem.activeZibs.splice(zibIdx, 1);
                    showMessage(`ZIB TAXI HIJACKED. IT'S YOURS NOW.`);
                }
                // 4. Eject Driver Logic
                else if (target.driverType === 'ganger' || (target.brand === 'Gelfash' && Math.random() < 0.2)) {
                    let ganger = new Ganger(this.car.x - 30, this.car.y + 30);
                    this.enemies.push(ganger);
                    showMessage(`${target.brand.toUpperCase()} ${target.modelName.toUpperCase()} HIJACKED! DRIVER HOSTILE!`);
                } else {
                    showMessage(`${target.brand.toUpperCase()} ${target.modelName.toUpperCase()} HIJACKED.`);
                }
            
                // 5. Enter
                this.toggleVehicle();
            },

            
            // Raycast check for Light Occlusion (Shadows)
            checkLineOfSight(x1, y1, x2, y2) {
                return !isLineBlocked(x1, y1, x2, y2, this.activeMap.walls, getColliders(this.activeMap));
            },
            
            calculatePlayerVisibility() {
                // 1. BASE: Start with Ambient Light Level (World Darkness)
                // Outdoors (Day): Ambient 0 -> Visibility 1.0
                // Indoors (Dark): Ambient 0.95 -> 1.0 - (0.95 * 1.3) = -0.235 (Clamped to 0.0)
                let visibility = 1.0 - (this.getAmbientDarkness() * 1.3);
                
                // 2. STATIC LIGHTS (Lamps)
                for (let lamp of this.lamps) {
                    // Skip lamps in rooms with lights switched off
                    if (this.roomSystem.isLampRoomDark(lamp)) continue;
                    
                    const dist = Math.hypot(this.player.x - lamp.x, this.player.y - lamp.y);
                    if (dist < lamp.radius) {
                        // Shadow Check (Raycast)
                        const lampY = (lamp.type === 4 || lamp.type === 3) ? lamp.y : lamp.y - 60;
                        if (this.checkLineOfSight(this.player.x, this.player.y, lamp.x, lampY)) {
                            // Intensity fades over distance
                            const intensity = (1.0 - (dist / lamp.radius));
                            visibility += intensity * 0.8; 
                        }
                    }
                }

                // --- PROPS (Vending Machines & Medbays) - Dynamic Visibility ---
                for (let prop of this.props) {
                    if (prop.interactionType === 'medbay_refill' || prop.interactionType === 'vending_machine') {
                        const center = prop.getCenter();
                        const px = center.x;
                        const py = center.y;
                        
                        // 1. Calculate Dynamic State (stable seed so animation doesn't jump when pushed)
                        const time = Date.now();
                        const offset = (prop.id || 0) * 1337;
                        const isMedbay = prop.interactionType === 'medbay_refill';
                        
                        let intensityMod = 1.0;
                        let radiusMod = 1.0;

                        if (isMedbay) {
                            // Medbay Pulse
                            const breath = Math.sin((time + offset) / 400); 
                            intensityMod = 0.9 + (breath * 0.2); 
                            radiusMod = 1.0 + (breath * 0.05);
                        } else {
                            // Vending Glitch
                            // NOTE: Since calculatePlayerVisibility runs every frame, 
                            // Math.random() might make the UI jittery if the glitch isn't sustained.
                            // For gameplay stability, we only apply the "Hum" here, or use a time-based flicker.
                            // Let's use the 'Hum' for mechanic stability so the stealth meter doesn't seize up.
                            const hum = Math.sin((time + offset) / 50);
                            intensityMod = 1.0 + hum * 0.05; 
                            
                            // Optional: If you want the glitch to save you, uncomment below, 
                            // but be warned the UI bar might flash rapidly.
                        }

                        // 2. Determine Range & Line of Sight
                        // Dynamic range based on the pulse
                        const currentLightRadius = 160 * radiusMod; 

                        const dist = Math.hypot(this.player.x - px, this.player.y - py);
                        
                        if (dist < currentLightRadius) {
                            if (this.checkLineOfSight(this.player.x, this.player.y, px, py)) {
                                // Calculate base intensity from distance
                                let lightLevel = (1.0 - (dist / currentLightRadius));
                                
                                // Apply the Dynamic Pulse Modifier
                                lightLevel *= intensityMod;
                                
                                // Add to total visibility (Weight 0.6)
                                visibility += lightLevel * 0.6; 
                            }
                        }
                    }
                }
            
                // 3. DYNAMIC LIGHT BONUSES
            
                // Muzzle Flashes (High Intensity, Instant)
                for (let flash of this.muzzleFlashes) {
                    const dist = Math.hypot(this.player.x - flash.x, this.player.y - flash.y);
                    if (dist < flash.radius) {
                        const intensity = (1.0 - (dist / flash.radius));
                        visibility += intensity * 1.0; 
                    }
                }
            
                // Projectiles (Glowing Bullets/Magic)
                for (let proj of this.projectiles) {
                    const dist = Math.hypot(this.player.x - proj.x, this.player.y - proj.y);
                    // Visual radius is roughly 30px for glow
                    const glowRadius = 40; 
                    if (dist < glowRadius) {
                        const intensity = (1.0 - (dist / glowRadius));
                        visibility += intensity * 0.6; 
                    }
                }
            
                // Car Headlights (Cone Check)
                if (this.car && this.car.visible && !this.isDriving) {
                    const dx = this.player.x - this.car.x;
                    const dy = this.player.y - this.car.y;
                    const cos = Math.cos(-this.car.angle);
                    const sin = Math.sin(-this.car.angle);
                    
                    const localX = dx * cos - dy * sin; // Forward distance
                    const localY = dx * sin + dy * cos; // Sideways distance
            
                    // Headlight range is ~400px, Width expands outwards
                    if (localX > 0 && localX < 400) {
                        const coneWidthAtDist = localX * 0.4; 
                        if (Math.abs(localY) < coneWidthAtDist) {
                             if (this.checkLineOfSight(this.player.x, this.player.y, this.car.x, this.car.y)) {
                                 const intensity = (1.0 - (localX / 400));
                                 visibility += intensity * 0.9;
                             }
                        }
                    }
                }
            
                // 4. CLAMP & UI UPDATE
                this.player.visibility = Math.min(1.0, Math.max(0.0, visibility * (this.sneaking ? SNEAK.VISIBILITY : 1)));   // sneaking: harder to make out (engine/sneak.js)
                
                // Calculate percentage (100% Hidden = 0% Visible)
                const hiddenPercent = Math.round((1.0 - this.player.visibility) * 100);
                
                // Target the NEW stealth indicator
                const stealthUI = document.getElementById('ui-stealth-indicator');
                
                // Threshold: If visibility is below 30%, you are considered Hidden
                if (this.player.visibility < 0.30) {
                    stealthUI.style.display = 'block';
                    stealthUI.textContent = `HIDDEN (${hiddenPercent}%)`;
                    this.player.isHidden = true;
                } else {
                    stealthUI.style.display = 'none';
                    this.player.isHidden = false;
                }

                // Clean up the OLD buff UI if it was showing hidden status previously
                const buffUI = document.getElementById('ui-buffs');
                if (buffUI.textContent.includes('HIDDEN')) {
                    buffUI.style.display = 'none';
                }
            },

            checkPlayerCarCollision(px, py) {
                if (!this.car.visible) return false;
                const dx = px - this.car.x; const dy = py - this.car.y; const cos = Math.cos(-this.car.angle); const sin = Math.sin(-this.car.angle);
                const localX = dx * cos - dy * sin; const localY = dx * sin + dy * cos; const halfLen = this.car.length / 2 + 15; const halfWid = this.car.width / 2 + 15;
                if (Math.abs(localX) < halfLen && Math.abs(localY) < halfWid) return true; return false;
            },

            updateTime(force = false) {
                // Counted in sim ticks (not wall-clock) so the clock follows
                // CONFIG.LOOP.GAME_SPEED along with everything else.
                this._clockTicks = (this._clockTicks || 0) + 1;
                if (force || this._clockTicks >= CONFIG.LOOP.TICKS_PER_WORLD_MINUTE) { 
                    this._clockTicks = 0;
                    this.worldMinutes++; this.lastTimeTick = Date.now(); 
                    // worldMinutes is MONOTONIC — it counts up forever. Day-of-cycle
                    // values are derived via `% 1440` at the read site (display,
                    // ambient darkness, window lit-state). Wrapping here would
                    // silently break any timer stored as `worldMinutes + duration`
                    // — e.g. buffs activated at 23:30 with a 60-min duration set
                    // endTime = 1470, then the clock would snap to 0 and the
                    // comparison `worldMinutes >= endTime` becomes false forever,
                    // making the buff (and contract hires) effectively permanent.
                    let h = Math.floor(this.worldMinutes / 60) % 24; let m = this.worldMinutes % 60; 
                    this.uiTime.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`; 
                    
                    this.updateDaytimeExposure();
                    
                    // Tick all active buffs — config-driven expiry + lifecycle hooks
                    this.player.buffSystem.tick(this.worldMinutes, this);
                    
                    // Advance the weather schedule. Ticked per world-minute rather
                    // than per-frame so condition durations are written in the same
                    // units as the game clock, and so the cost is once per 2s
                    // instead of 60x/sec.
                    this.weather.tickSchedule(this.worldMinutes);
                    
                    // Check contract companion expiration (unified)
                    for (let i = this.teammates.length - 1; i >= 0; i--) {
                        const tm = this.teammates[i];
                        if (tm.hireType === 'contract' && tm.hired && this.worldMinutes >= tm.hireTime) {
                            showMessage(`${tm.name.toUpperCase()}'S TIME IS UP.`);
                            this.dismissCompanion(tm);
                        }
                    }
                }
            },
            
            /**
             * The day, in one place — everything that changes with the hour reads this:
             *   darkness  outdoor sky darkness 0…0.6 (clouds and rain dim the day a little)
             *   tint      colour of the dark: violet-indigo night, gold dusk, rose dawn
             *   daylight  0…1 sun through windows (peaks at noon)
             *   sun       0…1 daytime exposure (06:00–18:00)
             *   lampsOn   street lamps burn from late afternoon to just after dawn
             */
            dayCycle() {
                const w = this.weather, wet = w ? Math.min(1, Math.max(0, w.intensity || 0)) : 0;
                const key = this.worldMinutes + ':' + wet.toFixed(2);
                if (this._dayCycle && this._dayCycle.key === key) return this._dayCycle;
                const h = (this.worldMinutes % 1440) / 60, MAX = 0.6;
                let dark = h >= 5 && h < 6 ? MAX * (1 - (h - 5))            // dawn
                         : h >= 6 && h < 18 ? 0                               // day
                         : h >= 18 && h < 20 ? MAX * (h - 18) / 2              // dusk
                         : MAX;                                                // night
                dark += (MAX - dark) * 0.2 * wet;                              // overcast and rain
                // The colour of the dark
                const NIGHT = [30, 13, 68], DUSK = [84, 40, 16], DAWN = [70, 26, 58];
                const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))));
                const tint = h >= 17 && h < 21 ? mix(DUSK, NIGHT, (h - 18.6) / 1.4)
                           : h >= 4 && h < 7 ? mix(NIGHT, DAWN, (h - 4.4) / 0.8)
                           : NIGHT;
                return (this._dayCycle = {
                    key, hour: h, darkness: dark, tint, tintRGB: tint.join(', '),
                    daylight: Math.max(0, 1 - Math.abs(12 - h) / 6),
                    sun: h > 6 && h < 18 ? Math.sin(Math.PI * (h - 6) / 12) : 0,
                    lampsOn: h >= 17.5 || h < 6.25
                });
            },

            getAmbientDarkness() {
                // Per-map override (e.g. well-lit interiors like arenas)
                if (this.activeMap.ambientDarkness !== undefined) return this.activeMap.ambientDarkness;
                // Indoors is lamp-lit (outdoor rooms carve the sky's light back in: RoomSystem.carveSkyLight)
                if (this.activeMap.type === 'indoor') return 0.95;
                return this.dayCycle().darkness;
            },
            
            /* --- ADD TO GameEngine CLASS --- */
            
            /**
             * Get landmark coordinates by ID.
             * Checks in order:
             * 1. Dynamic entities (player, boss)
             * 2. Current map's landmark registry (populated during loadMap)
             * 3. Fallback to player position
             * 
             * @param {string} id - Landmark identifier (e.g., 'club_entrance', 'apt_door')
             * @returns {{ x: number, y: number }} World coordinates
             */
            getLandmark(id) {
                // 1. Dynamic Entities (Moving targets)
                if (id === 'player') return { x: this.player.x, y: this.player.y };
                if (id === 'player_car' || id === 'blackmark') return this.ownedCar ? { x: this.ownedCar.x, y: this.ownedCar.y } : { x: this.player.x, y: this.player.y };
                if (id === 'boss') return this.boss ? { x: this.boss.x, y: this.boss.y } : null;
                
                // 2. Check the landmark registry (populated by loadMap)
                if (this.landmarkRegistry[id]) {
                    return this.landmarkRegistry[id];
                }
                
                // 3. Fallback - warn and return player position
                console.warn(`Landmark ID not found: '${id}' - Available: [${Object.keys(this.landmarkRegistry).join(', ')}]`);
                return { x: this.player.x, y: this.player.y };
            },
            
            /**
             * Debug helper - call game.debugLandmarks() in console to see all registered landmarks
             */
            debugLandmarks() {
                console.log('=== LANDMARK REGISTRY ===');
                console.log(`Map: ${this.activeMap?.id || 'none'}`);
                console.log(`Total landmarks: ${Object.keys(this.landmarkRegistry).length}`);
                for (const [id, pos] of Object.entries(this.landmarkRegistry)) {
                    console.log(`  ${id}: (${pos.x}, ${pos.y})`);
                }
                return this.landmarkRegistry;
            },

        });

