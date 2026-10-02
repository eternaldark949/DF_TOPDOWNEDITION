        // --- PAUSE MENU SYSTEM (Phase 3) ---
        // ─── SAVE SLOT MANAGER ─────────────────────────────────────────────
        //  Multi-slot save system with visual picker overlay.
        //  Supports SAVE mode (choose slot to write) and LOAD mode (choose slot to read).
        //  Migrates legacy single-key saves to slot 0 on first use.
        // ──────────────────────────────────────────────────────────────────────

        class SaveSlotManager {
            constructor() {
                this.maxSlots = 3;
                this.activeSlot = parseInt(localStorage.getItem('dfab_active_slot') ?? '0');
                this.overlay = document.getElementById('save-slot-overlay');
                this.mode = 'load';
                this.onComplete = null;
                this._confirmTarget = null;
                this._modeBeforeDelete = null;
                
                this.MAP_NAMES = {
                    'hub_949': 'Moon City',
                    'road_test': 'Outskirts',
                    'ethereal_plane': 'Ethereal Plane',
                    'apt_949': '949\'s Apartment',
                    'hotel_lobby': 'Double Nights Hotel',
                    'hotel_suite': 'Hotel Suite',
                    'medbay_sw': 'Medbay SW',
                    'moon_city_nightclub': 'Nightclub',
                    'church_boss': 'Abandoned Church',
                    'enni_cole_interior': 'Enni Cole',
                    'cozy_cafe_interior': 'Cozy Café',
                    'auto_shop': 'Torque Auto',
                    'neural_sys_interior': 'Neural Systems',
                    'biggs_arena': 'Biggs Park',
                    'house_of_death': 'The House of Death',
                };
                
                this._migrateV1Save();
            }

            // --- STORAGE KEYS ---
            _slotKey(i) { return `dfab_save_slot_${i}`; }

            // --- MIGRATION ---
            _migrateV1Save() {
                const oldSave = localStorage.getItem('dimensions_save_data');
                if (oldSave && !localStorage.getItem(this._slotKey(0))) {
                    localStorage.setItem(this._slotKey(0), oldSave);
                    localStorage.setItem('dfab_active_slot', '0');
                    this.activeSlot = 0;
                    console.log('[SAVE SLOTS] Migrated legacy save → Slot 1');
                }
            }

            // --- SLOT DATA ---
            getSlotData(index) {
                const json = localStorage.getItem(this._slotKey(index));
                if (!json) return null;
                try { return JSON.parse(json); } catch(e) { return null; }
            }

            getSlotSummary(index) {
                const data = this.getSlotData(index);
                if (!data) return null;
                const mapId = data.world?.mapId || data.mapId || 'hub_949';
                return {
                    timestamp: data.timestamp || 0,
                    mapName: this.MAP_NAMES[mapId] || mapId,
                    currency: data.player?.currency ?? data.currency ?? 0,
                    storyStep: data.story?.state?.step ?? 0,
                    worldMinutes: data.world?.worldMinutes ?? data.worldMinutes ?? 480,
                };
            }

            // --- ACTIVE SLOT KEY (used by saveGame/loadGame) ---
            getActiveKey() {
                return this._slotKey(this.activeSlot);
            }

            setActiveSlot(index) {
                this.activeSlot = index;
                localStorage.setItem('dfab_active_slot', String(index));
            }

            // --- SAVE TO SPECIFIC SLOT ---
            saveToSlot(index) {
                this.setActiveSlot(index);
                game.saveGame();
            }

            // --- LOAD FROM SPECIFIC SLOT ---
            loadFromSlot(index) {
                const data = this.getSlotData(index);
                if (!data) return false;
                this.setActiveSlot(index);
                return game.loadGame();
            }

            // --- DELETE SLOT ---
            deleteSlot(index) {
                localStorage.removeItem(this._slotKey(index));
                if (this.activeSlot === index) {
                    // Find another occupied slot, or keep 0
                    for (let i = 0; i < this.maxSlots; i++) {
                        if (i !== index && this.getSlotData(i)) {
                            this.setActiveSlot(i);
                            return;
                        }
                    }
                    this.setActiveSlot(0);
                }
            }

            // --- UI ---
            open(mode, onComplete) {
                this.mode = mode;
                this.onComplete = onComplete || null;
                this._confirmTarget = null;
                this._render();
                this.overlay.classList.add('active');
                requestAnimationFrame(() => { this.overlay.style.opacity = '1'; });
            }

            close() {
                this.overlay.style.opacity = '0';
                setTimeout(() => { this.overlay.classList.remove('active'); }, 300);
            }

            _formatDate(ts) {
                if (!ts) return '—';
                const d = new Date(ts);
                const mon = d.toLocaleString('en', { month: 'short' });
                const day = d.getDate();
                const hr = d.getHours().toString().padStart(2,'0');
                const min = d.getMinutes().toString().padStart(2,'0');
                return `${mon} ${day}, ${hr}:${min}`;
            }


            _render() {
                const title = this.mode === 'save' ? 'Save Game' : 'Load Game';
                let html = `<div class="save-slot-panel">
                    <div class="save-slot-title">${title}</div>`;

                for (let i = 0; i < this.maxSlots; i++) {
                    const summary = this.getSlotSummary(i);
                    const isActive = (i === this.activeSlot);
                    const isEmpty = !summary;
                    const modeClass = this.mode === 'load' ? 'mode-load' : 'mode-save';
                    const classes = ['save-slot-card'];
                    if (isActive && !isEmpty) classes.push('active-slot');
                    if (isEmpty) classes.push('empty-slot', modeClass);

                    html += `<div class="${classes.join(' ')}" data-slot="${i}">`;

                    if (this._confirmTarget === i) {
                        // Inline confirmation
                        const confirmText = this.mode === 'save'
                            ? 'Overwrite this save?'
                            : 'Delete this save permanently?';
                        html += `<div class="save-slot-confirm">
                            <div class="save-slot-confirm-text">${confirmText}</div>
                            <div class="save-slot-confirm-btns">
                                <button class="confirm-yes" data-confirm="yes" data-slot="${i}">Yes</button>
                                <button data-confirm="no">Cancel</button>
                            </div>
                        </div>`;
                    }

                    html += `<div class="save-slot-header">
                        <span class="save-slot-label">Slot ${i + 1}</span>`;
                    if (isActive && !isEmpty) {
                        html += `<span class="save-slot-badge badge-active">Active</span>`;
                    }
                    html += `</div>`;

                    if (summary) {
                        html += `<div class="save-slot-meta">
                            <span class="meta-map">⧫ ${summary.mapName}</span>
                            <span class="meta-currency">¤ ${summary.currency.toLocaleString()}</span>
                            <span class="meta-story">Ch. ${summary.storyStep}</span>
                            <span class="meta-date">${this._formatDate(summary.timestamp)}</span>
                        </div>`;
                        html += `<button class="save-slot-export-single" data-export="${i}" title="Export slot">⤓</button>`;
                        html += `<button class="save-slot-delete" data-delete="${i}" title="Delete save">✕</button>`;
                    } else {
                        html += `<div class="save-slot-empty-text">— Empty —</div>`;
                    }

                    html += `</div>`;
                }

                const hasAny = this.hasAnySave();
                html += `<div class="save-slot-footer">
                    <div class="save-slot-footer-actions">
                        ${hasAny ? '<button class="save-slot-action-btn export-btn" id="save-slot-export-all">⤓ Export All</button>' : ''}
                        <button class="save-slot-action-btn import-btn" id="save-slot-import">⤒ Import</button>
                    </div>
                    <button class="save-slot-close-btn" id="save-slot-close">Cancel</button>
                </div>
                <div class="save-slot-import-msg" id="save-slot-import-msg"></div>
                <input type="file" id="save-slot-file-input" accept=".json" style="display:none;">
                </div>`;

                this.overlay.innerHTML = html;
                this._bindEvents();
            }

            _bindEvents() {
                // Close
                this.overlay.querySelector('#save-slot-close').addEventListener('click', () => this.close());
                this.overlay.addEventListener('click', (e) => {
                    if (e.target === this.overlay) this.close();
                });

                // Slot cards
                this.overlay.querySelectorAll('.save-slot-card').forEach(card => {
                    card.addEventListener('click', (e) => {
                        // Don't trigger if clicking delete or confirm buttons
                        if (e.target.closest('.save-slot-delete') || e.target.closest('.save-slot-confirm')) return;
                        const slot = parseInt(card.dataset.slot);
                        this._onSlotClick(slot);
                    });
                });

                // Delete buttons
                this.overlay.querySelectorAll('.save-slot-delete').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const slot = parseInt(btn.dataset.delete);
                        this._confirmTarget = slot;
                        this._modeBeforeDelete = this.mode;
                        this.mode = '_delete';
                        this._render();
                    });
                });

                // Confirm buttons
                this.overlay.querySelectorAll('[data-confirm]').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (btn.dataset.confirm === 'yes') {
                            const slot = parseInt(btn.dataset.slot);
                            if (this.mode === '_delete') {
                                this.deleteSlot(slot);
                                audioSys.sfx('ui');
                                showMessage(`SLOT ${slot + 1} DELETED.`);
                            } else if (this.mode === 'save') {
                                this._executeSave(slot);
                                return; // _executeSave closes overlay
                            }
                        }
                        this._confirmTarget = null;
                        if (this.mode === '_delete') this.mode = this._modeBeforeDelete || 'load';
                        this._render();
                    });
                });

                // Per-slot export
                this.overlay.querySelectorAll('.save-slot-export-single').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.exportSlot(parseInt(btn.dataset.export));
                    });
                });

                // Export All
                const exportAllBtn = this.overlay.querySelector('#save-slot-export-all');
                if (exportAllBtn) {
                    exportAllBtn.addEventListener('click', () => this.exportAll());
                }

                // Import
                const importBtn = this.overlay.querySelector('#save-slot-import');
                const fileInput = this.overlay.querySelector('#save-slot-file-input');
                if (importBtn && fileInput) {
                    importBtn.addEventListener('click', () => fileInput.click());
                    fileInput.addEventListener('change', (e) => {
                        if (e.target.files.length > 0) {
                            this.importSaves(e.target.files[0]);
                            e.target.value = ''; // Reset for re-import
                        }
                    });
                }
            }

            _onSlotClick(slot) {
                const summary = this.getSlotSummary(slot);

                if (this.mode === 'save') {
                    if (summary) {
                        // Slot occupied — confirm overwrite
                        this._confirmTarget = slot;
                        this._render();
                    } else {
                        // Empty slot — save directly
                        this._executeSave(slot);
                    }
                } else if (this.mode === 'load') {
                    if (!summary) return; // Can't load empty
                    this._executeLoad(slot);
                }
            }

            _executeSave(slot) {
                this.saveToSlot(slot);
                this.close();
                if (this.onComplete) this.onComplete(true);
            }

            _executeLoad(slot) {
                this.close();
                // Small delay so overlay fades before heavy load work
                setTimeout(() => {
                    const success = this.loadFromSlot(slot);
                    if (this.onComplete) this.onComplete(success);
                }, 100);
            }

            /** Check if ANY slot has save data (for main menu load button state). */
            hasAnySave() {
                for (let i = 0; i < this.maxSlots; i++) {
                    if (this.getSlotData(i)) return true;
                }
                return false;
            }

            // --- EXPORT ALL SLOTS ---
            exportAll() {
                const exportData = {
                    game: 'DFAB',
                    version: 2,
                    exportDate: new Date().toISOString(),
                    activeSlot: this.activeSlot,
                    slots: {}
                };
                for (let i = 0; i < this.maxSlots; i++) {
                    const data = this.getSlotData(i);
                    if (data) exportData.slots[i] = data;
                }
                if (Object.keys(exportData.slots).length === 0) {
                    showMessage('NO SAVE DATA TO EXPORT.');
                    return;
                }
                this._downloadJSON(exportData, 'dfab_saves_all.json');
                showMessage('ALL SAVES EXPORTED.');
                audioSys.sfx('ui');
            }

            // --- EXPORT SINGLE SLOT ---
            exportSlot(index) {
                const data = this.getSlotData(index);
                if (!data) return;
                const exportData = {
                    game: 'DFAB',
                    version: 2,
                    exportDate: new Date().toISOString(),
                    activeSlot: index,
                    slots: { [index]: data }
                };
                this._downloadJSON(exportData, `dfab_save_slot${index + 1}.json`);
                showMessage(`SLOT ${index + 1} EXPORTED.`);
                audioSys.sfx('ui');
            }

            // --- IMPORT SAVES ---
            importSaves(file) {
                const msgEl = this.overlay.querySelector('#save-slot-import-msg');
                const showMsg = (text, success) => {
                    if (msgEl) {
                        msgEl.textContent = text;
                        msgEl.style.color = success ? '#88ccaa' : '#ff8888';
                        msgEl.classList.add('show');
                        setTimeout(() => msgEl.classList.remove('show'), 4000);
                    }
                };

                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const importData = JSON.parse(e.target.result);

                        // Validate
                        if (!importData || importData.game !== 'DFAB' || !importData.slots) {
                            showMsg('INVALID SAVE FILE.', false);
                            return;
                        }

                        let imported = 0;
                        for (const slotKey in importData.slots) {
                            const idx = parseInt(slotKey);
                            if (idx >= 0 && idx < this.maxSlots) {
                                const saveData = importData.slots[slotKey];
                                if (saveData && typeof saveData === 'object') {
                                    localStorage.setItem(this._slotKey(idx), JSON.stringify(saveData));
                                    imported++;
                                }
                            }
                        }

                        if (imported > 0) {
                            if (importData.activeSlot !== undefined) {
                                this.setActiveSlot(parseInt(importData.activeSlot));
                            }
                            showMsg(`${imported} SLOT${imported > 1 ? 'S' : ''} IMPORTED SUCCESSFULLY.`, true);
                            showMessage(`${imported} SAVE SLOT${imported > 1 ? 'S' : ''} IMPORTED.`);
                            audioSys.sfx('ui');
                            this._render(); // Refresh the UI
                        } else {
                            showMsg('NO VALID SLOTS FOUND IN FILE.', false);
                        }
                    } catch (err) {
                        console.error('[IMPORT] Error:', err);
                        showMsg('FAILED TO READ SAVE FILE.', false);
                    }
                };
                reader.onerror = () => showMsg('FAILED TO READ FILE.', false);
                reader.readAsText(file);
            }

            // --- DOWNLOAD HELPER ---
            _downloadJSON(data, filename) {
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        }

        class PauseMenuController {
            constructor() {
                this.menu = document.getElementById('pause-menu');
                this.navMain = document.getElementById('pause-nav-main');
                this.settingsPanel = document.getElementById('pause-settings-panel');
                this.menuItems = this.navMain.querySelectorAll('.pause-menu-item');
                this.quickItems = this.menu.querySelectorAll('.pause-quick-item');
                this.activeIndex = 0;
                this.quickIndex = -1;       // the highlighted Quick Access item (-1: the main list has focus)
                this.isOpen = false;
                this.inSettings = false;
                
                this.init();
            }
            
            init() {
                // Click handlers for menu items
                this.menuItems.forEach((item, index) => {
                    item.addEventListener('click', () => {
                        this.setActiveIndex(index);
                        this.executeAction(item.dataset.action);
                    });
                    
                    item.addEventListener('mouseenter', () => {
                        this.setActiveIndex(index);
                    });
                });
                
                // Quick Access (left column)
                this.quickItems.forEach((item, index) => {
                    item.addEventListener('click', () => { this.setQuickIndex(index); this.executeQuick(item.dataset.action); });
                    item.addEventListener('mouseenter', () => this.setQuickIndex(index));
                });

                // Now Playing: the disc changes station, the chevron plays / pauses (the music widget does the work)
                document.getElementById('pause-np-disc')?.addEventListener('click', () => { game.musicWidget?.cycleStation(); this._syncNowPlaying(); });
                document.getElementById('pause-np-play')?.addEventListener('click', () => {
                    game.musicWidget?.handlePlayClick();
                    setTimeout(() => this._syncNowPlaying(), 120);   // togglePlay settles after the AudioContext resumes
                });

                // Cinematic view: drag pans, pinch or wheel zooms, a quick tap brings the menu back
                this._cinePtrs = new Map();
                const cineOn = () => document.body.classList.contains('cinematic-view');
                window.addEventListener('pointerdown', (e) => {
                    if (!cineOn() || e.target.closest?.('#cine-bar, #cine-grade')) return;
                    e.preventDefault(); e.stopPropagation();
                    this._cinePtrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
                    if (this._cinePtrs.size > 1) this._cineGesture = true;            // a pinch is never a tap
                }, true);
                window.addEventListener('pointermove', (e) => {
                    const p = this._cinePtrs.get(e.pointerId);
                    if (!cineOn() || !p) return;
                    e.preventDefault();
                    if (this._cinePtrs.size === 1) {
                        if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8) this._cineGesture = true;
                        this._cinePan(e.clientX - p.x, e.clientY - p.y);
                    } else {
                        const [a, b] = [...this._cinePtrs.values()];
                        const before = Math.hypot(a.x - b.x, a.y - b.y);
                        p.x = e.clientX; p.y = e.clientY;
                        const after = Math.hypot(a.x - b.x, a.y - b.y);
                        if (before > 10) this._cineZoom(after / before);
                    }
                    p.x = e.clientX; p.y = e.clientY;
                }, true);
                const up = (e) => {
                    const p = this._cinePtrs.get(e.pointerId);
                    if (!p) return;
                    this._cinePtrs.delete(e.pointerId);
                    if (!cineOn()) return;
                    e.preventDefault(); e.stopPropagation();
                    const tap = !this._cineGesture && e.type === 'pointerup' && performance.now() - p.t0 < 400;
                    if (!this._cinePtrs.size) this._cineGesture = false;
                    if (tap) this.exitCinematic();
                };
                window.addEventListener('pointerup', up, true);
                window.addEventListener('pointercancel', up, true);
                window.addEventListener('wheel', (e) => {
                    if (!cineOn() || e.target.closest?.('#cine-grade')) return;
                    e.preventDefault(); this._cineZoom(Math.exp(-e.deltaY * 0.0015));
                }, { capture: true, passive: false });
                const bar = document.getElementById('cine-bar');
                bar?.addEventListener('click', (e) => {
                    const act = e.target.closest('[data-cine]')?.dataset.cine;
                    if (act === 'save') this.saveCinePicture();
                    else if (act === 'grade') this._cineGrade(!document.body.classList.contains('cine-grade-open'));
                    else if (act === 'in') this._cineZoom(1.2);
                    else if (act === 'out') this._cineZoom(1 / 1.2);
                    else if (act === 'reset') { const c = game.cineCam; if (c) { c.dx = c.dy = 0; game.camera.zoom = c.zoom; } }
                    else if (act === 'back') this.exitCinematic();
                });

                // The grade drawer: presets, sliders, the colour chips (app/boot.js holds the grade)
                const drawer = document.getElementById('cine-grade');
                drawer?.addEventListener('click', (e) => {
                    const pre = e.target.closest('[data-preset]');
                    if (pre) { applyGameGradePreset(+pre.dataset.preset); return; }
                    const act = e.target.closest('[data-cg]')?.dataset.cg;
                    if (act === 'close') this._cineGrade(false);
                    else if (act === 'seen' || act === 'full') { GameSettings.photoFullColour = act === 'full'; syncGradeDrawer(); }
                    else if (act === 'refl-on' || act === 'refl-off') { GameSettings.photoReflections = act === 'refl-on'; syncGradeDrawer(); }
                });
                drawer?.addEventListener('input', (e) => {
                    const k = e.target.dataset?.k;
                    if (k) setGameGradeValue(k, e.target.value);
                });

                // Click backdrop to close
                this.menu.querySelector('.pause-backdrop').addEventListener('click', () => {
                    if (this.inSettings) {
                        this.closeSettings();
                    } else {
                        this.close();
                    }
                });
                
                // Settings panel back button
                document.getElementById('pause-settings-back').addEventListener('click', () => {
                    this.closeSettings();
                });
                
                // Settings value toggles
                this.settingsPanel.querySelectorAll('.settings-value').forEach(el => {
                    el.addEventListener('click', () => {
                        this._cycleSetting(el);
                    });
                });
            }
            
            open() {
                if (!game.running) return; // Don't open if not in game
                
                this.menu.classList.add('active');
                this.isOpen = true;
                game.pauseSystem.acquire('pause_menu');
                this.setActiveIndex(0);
                this._syncNowPlaying();
                
                // Update mission objective display — all three types
                const storyText = document.getElementById('pause-obj-story-text');
                const optionalText = document.getElementById('pause-obj-optional-text');
                const sideText = document.getElementById('pause-obj-side-text');
                const cancelDiv = document.getElementById('pause-mission-cancel');

                // STORY OBJECTIVE
                if (storyText && game.story) {
                    const step = game.story.currentStepData;
                    if (step && step.banner) {
                        storyText.innerHTML = step.banner;
                    } else if (step && step.name) {
                        storyText.innerHTML = step.name.replace(/_/g, ' ');
                    } else {
                        storyText.innerHTML = '<span class="pause-obj-none">—</span>';
                    }
                }

                // OPTIONAL QUEST
                if (optionalText && game.story) {
                    const opt = game.story.activeOptional;
                    if (opt && opt.stepData) {
                        const optName = opt.stepData.banner || opt.stepData.name || opt.id;
                        optionalText.innerHTML = optName.replace(/_/g, ' ');
                    } else {
                        optionalText.innerHTML = '<span class="pause-obj-none">—</span>';
                    }
                }

                // SIDE MISSION
                if (sideText && game.missions) {
                    const obj = game.missions.getObjectiveText();
                    if (obj) {
                        sideText.innerHTML = obj;
                        if (cancelDiv) cancelDiv.style.display = 'block';
                    } else {
                        sideText.innerHTML = '<span class="pause-obj-none">—</span>';
                        if (cancelDiv) cancelDiv.style.display = 'none';
                    }
                }
                
                // Wire abandon button
                const abandonBtn = document.getElementById('btn-abandon-mission');
                if (abandonBtn) {
                    abandonBtn.onclick = () => {
                        if (game.missions && game.missions.activeMission) {
                            game.missions.abandonMission();
                            const st = document.getElementById('pause-obj-side-text'); if (st) st.innerHTML = '<span class="pause-obj-none">Mission abandoned</span>';
                            if (cancelDiv) cancelDiv.style.display = 'none';
                        }
                    };
                }
            }
            
            close() {
                this.menu.classList.remove('active');
                this.isOpen = false;
                this.inSettings = false;
                this.settingsPanel.classList.remove('active');
                this.navMain.style.display = '';
                // Just release our token — the registry handles whether the world
                // remains paused. If dialogue, a shop, or another menu is also open,
                // their tokens keep the pause; this close is simply a no-op for the
                // overall pause state in those cases.
                game.pauseSystem.release('pause_menu');
            }
            
            toggle() {
                if (this.isOpen) {
                    this.close();
                } else {
                    this.open();
                }
            }
            
            setActiveIndex(index) {
                this.quickItems.forEach(item => item.classList.remove('active'));
                this.quickIndex = -1;
                this.menuItems.forEach(item => item.classList.remove('active'));
                this.activeIndex = index;
                this.menuItems[index].classList.add('active');
                this.menuItems[index].focus();
            }

            // One highlight at a time: lighting a Quick Access item dims the main list's
            setQuickIndex(index) {
                this.menuItems.forEach(item => item.classList.remove('active'));
                this.quickItems.forEach(item => item.classList.remove('active'));
                this.quickIndex = index;
                this.quickItems[index].classList.add('active');
                this.quickItems[index].focus();
            }
            
            navigateUp() {
                if (this.quickIndex >= 0) { this.setQuickIndex(this.quickIndex > 0 ? this.quickIndex - 1 : this.quickItems.length - 1); return; }
                const newIndex = this.activeIndex > 0 ? this.activeIndex - 1 : this.menuItems.length - 1;
                this.setActiveIndex(newIndex);
            }
            
            navigateDown() {
                if (this.quickIndex >= 0) { this.setQuickIndex((this.quickIndex + 1) % this.quickItems.length); return; }
                const newIndex = this.activeIndex < this.menuItems.length - 1 ? this.activeIndex + 1 : 0;
                this.setActiveIndex(newIndex);
            }

            // ← Quick Access (left column) · → the main list
            navigateLeft() { if (this.quickIndex < 0 && !this.inSettings) this.setQuickIndex(0); }
            navigateRight() { if (this.quickIndex >= 0) this.setActiveIndex(this.activeIndex); }
            
            selectCurrent() {
                if (this.quickIndex >= 0) { this.executeQuick(this.quickItems[this.quickIndex].dataset.action); return; }
                this.executeAction(this.menuItems[this.activeIndex].dataset.action);
            }

            executeQuick(action) {
                if (action === 'equip') { this.close(); Screens.open('equipped'); }
                else if (action === 'drop') { this.close(); Screens.open('inventory'); }
                else if (action === 'cinematic') this.enterCinematic();
            }

            // The world held still with every bit of HUD faded away; a tap or Esc brings the menu back
            //   opts.grade: open with the grade drawer showing; opts.back: 'settings' returns there
            //   opts.focus {x, y, zoom}: frame a spot (the finisher's capture prompt)
            enterCinematic(opts = {}) {
                this.close();
                game.pauseSystem.acquire('cinematic_view');
                game.cineCam = { dx: 0, dy: 0, zoom: game.camera.zoom };          // draw() keeps going while it's set
                const f = opts.focus;
                if (f) {
                    const R = CONFIG.CAMERA.CINE_PAN, [lo, hi] = CONFIG.CAMERA.CINE_ZOOM;
                    let dx = f.x - game.camera.x, dy = f.y - game.camera.y; const d = Math.hypot(dx, dy);
                    if (d > R) { dx *= R / d; dy *= R / d; }
                    game.cineCam.dx = dx; game.cineCam.dy = dy;
                    if (f.zoom) game.camera.zoom = Math.max(lo, Math.min(hi, f.zoom));
                }
                this._cineBack = opts.back || null;
                this._cineGrade(!!opts.grade);
                if (game.weather) game.weather._cineDensity = 0;                     // re-measured on the first pan
                this._cinePtrs?.clear(); this._cineGesture = false;
                document.body.classList.add('cinematic-view');
                const hint = document.getElementById('cinematic-hint');
                if (hint) { hint.classList.remove('show'); void hint.offsetWidth; hint.classList.add('show'); }
            }

            exitCinematic() {
                if (!document.body.classList.contains('cinematic-view')) return;
                document.body.classList.remove('cinematic-view');
                this._cineGrade(false);
                document.getElementById('cinematic-hint')?.classList.remove('show');
                if (game.cineCam) { game.camera.zoom = game.cineCam.zoom; game.cineCam = null; }
                game.pauseSystem.release('cinematic_view');
                this.open();
                if (this._cineBack === 'settings') this.openSettings();
                this._cineBack = null;
            }

            /** Show or hide the grade drawer over the held frame */
            _cineGrade(on) {
                document.body.classList.toggle('cine-grade-open', on);
                document.querySelector('#cine-bar [data-cine="grade"]')?.classList.toggle('on', on);
                if (on) syncGradeDrawer();
            }

            /** A small "Capture?" pill for a moment worth a photo (the finisher): tapping it opens Cinematic View framed on the spot */
            capturePrompt(focus, ms = 2600) {
                if (GameSettings.capturePrompt === false) return;
                let pill = document.getElementById('capture-pill');
                if (!pill) {
                    pill = document.createElement('button'); pill.id = 'capture-pill'; pill.textContent = '📷 Capture?';
                    document.body.appendChild(pill);
                    pill.addEventListener('click', (e) => {
                        e.preventDefault(); e.stopPropagation();
                        pill.classList.remove('show');
                        if (!game.paused && !game.scenes?.running) this.enterCinematic({ focus: pill._focus });
                    });
                }
                pill._focus = focus;
                pill.classList.remove('show'); void pill.offsetWidth; pill.classList.add('show');
                clearTimeout(this._capT); this._capT = setTimeout(() => pill.classList.remove('show'), ms);
            }

            /** Pan by a screen-space drag (CSS px), kept within CINE_PAN world px of where the view began. */
            _cinePan(sx, sy) {
                const c = game.cineCam; if (!c) return;
                const k = (game.canvas.width / (game.canvas.clientWidth || game.canvas.width)) / game.camera.zoom;
                c.dx -= sx * k; c.dy -= sy * k;
                const R = CONFIG.CAMERA.CINE_PAN, d = Math.hypot(c.dx, c.dy);
                if (d > R) { c.dx *= R / d; c.dy *= R / d; }
                this._cineRain();
            }

            /** Held rain over wherever the photo now looks (world/weather.js fillView) */
            _cineRain() {
                const c = game.cineCam, W = game.weather;
                if (!c || !W || !W.isRaining || !W.fillView) return;
                const z0 = c.zoom, m = 200 / z0, hw = W.width / z0 / 2 + m, hh = W.height / z0 / 2 + m;
                const cx = game.camera.x, cy = game.camera.y;              // where the real camera spawned its rain
                W.fillView({ x: cx + c.dx, y: cy + c.dy, zoom: game.camera.zoom }, { l: cx - hw, r: cx + hw, t: cy - hh, b: cy + hh });
            }

            _cineZoom(f) {
                if (!game.cineCam) return;
                const [lo, hi] = CONFIG.CAMERA.CINE_ZOOM;
                game.camera.zoom = Math.max(lo, Math.min(hi, game.camera.zoom * f));
                this._cineRain();
            }

            /** The held frame as a PNG, colour grade and all: downloaded, or the share sheet where files can be shared (phones). */
            saveCinePicture() {
                const src = game.canvas, out = document.createElement('canvas');
                out.width = src.width; out.height = src.height;
                const ctx = out.getContext('2d');
                const f = src.style.filter;
                if (f && f !== 'none' && 'filter' in ctx) ctx.filter = f;
                ctx.drawImage(src, 0, 0);
                ctx.filter = 'none';
                gradePhotoPass(out, src.clientWidth);                              // the temperature / tint wash and vignette, as on screen
                const flash = document.getElementById('cine-flash');
                if (flash) { flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go'); }
                const d = new Date(), z = (n) => String(n).padStart(2, '0');
                const name = `Dimensions-Freelancer-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.png`;
                out.toBlob(async (blob) => {
                    if (!blob) return;
                    this._lastPicture = blob;
                    const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
                    const touch = window.matchMedia?.('(pointer: coarse)').matches;
                    if (touch && file && navigator.canShare?.({ files: [file] })) {
                        try { await navigator.share({ files: [file], title: 'Dimensions: Freelancer' }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
                    }
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob); a.download = name;
                    document.body.appendChild(a); a.click(); a.remove();
                    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
                }, 'image/png');
            }

            // The capsule mirrors the music widget: station on the disc, track (or station) and play state
            _syncNowPlaying() {
                const mw = game.musicWidget; if (!mw) return;
                const station = mw.stations?.[mw.currentStationIdx]?.name || '';
                const track = (mw.trackText?.textContent || '').trim();
                const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
                set('pause-np-station', station.split(' ')[0].toUpperCase());   // one word fits the disc
                set('pause-np-track', track && !/^(no track|upload|tap|insert tape)/i.test(track) ? track : (/radio/i.test(station) ? station : station + ' Radio'));
                set('pause-np-icon', mw.isPlaying ? '❚❚' : '▶');
            }
            
            executeAction(action) {
                switch(action) {
                    case 'resume':
                        this.close();
                        break;
                    case 'save':
                        if (typeof saveSlotManager !== 'undefined') {
                            saveSlotManager.open('save');
                        } else {
                            game.saveGame();
                            showMessage('GAME SAVED');
                        }
                        break;
                    case 'load':
                        if (typeof saveSlotManager !== 'undefined') {
                            this.close();
                            saveSlotManager.open('load', (success) => {
                                if (!success) {
                                    showMessage('LOAD FAILED.');
                                }
                            });
                        } else {
                            showMessage('LOAD GAME - Coming Soon');
                        }
                        break;
                    case 'inventory':
                    case 'map':
                    case 'team':
                        this.close();
                        Screens.open(action);
                        break;
                    case 'settings':
                        this.openSettings();
                        break;
                    case 'dlc':
                        showMessage('MANAGE DLC - Coming Soon');
                        break;
                    case 'manual':
                        showMessage('GAME MANUAL - Coming Soon');
                        break;
                    case 'quit':
                        this.close();
                        game.stop();
                        break;
                }
            }
            
            // --- SETTINGS PANEL ---
            openSettings() {
                this.inSettings = true;
                this.navMain.style.display = 'none';
                this.settingsPanel.classList.add('active');
                this._syncSettingsUI();
            }
            
            closeSettings() {
                this.inSettings = false;
                this.settingsPanel.classList.remove('active');
                this.navMain.style.display = '';
            }
            
            _syncSettingsUI() {
                // Sync all settings UI elements with current GameSettings values
                this._updateValueEl('set-traffic', GameSettings.trafficDensity);
                this._updateValueEl('set-pedestrians', GameSettings.pedestrianDensity);
                this._updateValueEl('set-foliage', GameSettings.foliageDensity);
                this._updateValueEl('set-rain', GameSettings.rainDensity);
                this._updateValueEl('set-lighting', GameSettings.lightingQuality);
                this._updateValueEl('set-grain', GameSettings.filmGrain ? 'on' : 'off');
                for (const [id, key] of [['set-flitring', 'flitRing'], ['set-flitflick', 'flitFlick'], ['set-flittwo', 'flitTwoFinger'], ['set-flitbtn', 'flitButton'], ['set-aimfire', 'aimBeforeFire'], ['set-sniperrelease', 'sniperRelease'], ['set-scopeview', 'scopeView']])
                    this._updateValueEl(id, GameSettings[key] ? 'on' : 'off');
                this._updateValueEl('set-softshadows', GameSettings.softShadows ? 'on' : 'off');
                this._updateValueEl('set-bloom', GameSettings.bloom ? 'on' : 'off');
                this._updateValueEl('set-wetreflections', GameSettings.reflections || 'high');
                this._updateValueEl('set-atmosphere', GameSettings.atmosphereTint || 'off');
                this._updateValueEl('set-colorgrade', GameSettings.colorGrade === 'none' ? 'none' : GameSettings.colorGrade.replace(/_/g, ' '));
                this._updateValueEl('set-colorgrade', GameSettings.colorGrade === 'none' ? 'none' : GameSettings.colorGrade.replace(/_/g, ' '));
                this._updateValueEl('set-soundrings', GameSettings.soundRings || 'mirage');
                this._updateValueEl('set-finisher', GameSettings.finisher || 'full');
                this._updateValueEl('set-stealthgray', GameSettings.stealthGray !== false ? 'on' : 'off');
                this._updateValueEl('set-profiler', GameSettings.profilerMode || 'off');
                this._updateValueEl('set-debug', game.debugMode ? 'on' : 'off');
                this._updateValueEl('set-weather', game.weather && game.weather.scheduleLocked ? game.weather.condition : 'auto');
                this._updateValueEl('set-weaponmode', game.weaponMode === 'sniper' ? 'sniper' : 'normal');
                this._updateValueEl('set-audio', GameSettings.audioEnabled ? 'on' : 'off');
                syncAmbienceSliders();
                this._updateValueEl('set-fullscreen', !FullscreenManager.supported()
                    ? 'n/a' : (FullscreenManager.isActive() ? 'on' : 'off'));
                this._updateValueEl('set-orientation', OrientationManager.label());
                this._updateValueEl('set-fps', GameSettings.fpsLimit === 0 ? 'none' : String(GameSettings.fpsLimit));
            }
            
            _updateValueEl(id, value) {
                const el = document.getElementById(id);
                if (!el) return;
                
                const display = value.toUpperCase();
                el.textContent = display;
                
                // Update CSS class for color coding
                el.className = 'settings-value';
                if (value === 'low' || value === 'off') el.classList.add('val-low');
                else if (value === 'medium') el.classList.add('val-medium');
                else if (value === 'high' || value === 'on') el.classList.add('val-high');
                else if (value === 'none') el.classList.add('val-off');
            }
            
            _cycleSetting(el) {
                const key = el.dataset.key;
                
                if (key === 'flitRing' || key === 'flitFlick' || key === 'flitTwoFinger' || key === 'flitButton' || key === 'aimBeforeFire' || key === 'sniperRelease' || key === 'scopeView') {
                    GameSettings[key] = !GameSettings[key];
                    GameSettings.applyControls();
                    this._updateValueEl(el.id, GameSettings[key] ? 'on' : 'off');
                    
                } else if (key === 'filmGrain') {
                    GameSettings.filmGrain = !GameSettings.filmGrain;
                    GameSettings.applyFilmGrain();
                    this._updateValueEl(el.id, GameSettings.filmGrain ? 'on' : 'off');
                    
                } else if (key === 'softShadows') {
                    GameSettings.softShadows = !GameSettings.softShadows;
                    this._updateValueEl(el.id, GameSettings.softShadows ? 'on' : 'off');
                    
                } else if (key === 'bloom') {
                    GameSettings.bloom = !GameSettings.bloom;
                    this._updateValueEl(el.id, GameSettings.bloom ? 'on' : 'off');
                    
                } else if (key === 'reflections') {
                    const order = ['high', 'medium', 'off'];
                    GameSettings.reflections = order[(order.indexOf(GameSettings.reflections || 'high') + 1) % order.length];
                    GameSettings.wetReflections = GameSettings.reflections !== 'off';
                    this._updateValueEl(el.id, GameSettings.reflections);
                    
                } else if (key === 'fullscreen') {
                    if (!FullscreenManager.supported()) {
                        this._updateValueEl(el.id, 'n/a');
                        return;
                    }
                    // This runs inside the tap, which is the only moment the browser
                    // will grant the request. The choice is remembered; the
                    // fullscreenchange listener repaints this row.
                    FullscreenManager.toggle();
                    
                } else if (key === 'orientation') {
                    // Inside the tap: if we're fullscreen the lock takes at once, otherwise on the next fullscreen
                    if (OrientationManager.supported()) OrientationManager.cycle();
                    this._updateValueEl(el.id, OrientationManager.label());

                } else if (key === 'audioEnabled') {
                    audioSys.setEnabled(!GameSettings.audioEnabled);
                    this._updateValueEl(el.id, GameSettings.audioEnabled ? 'on' : 'off');
                    
                } else if (key === 'atmosphereTint') {
                    const atmosOrder = ['', 'amber', 'violet', 'crimson', 'teal'];
                    const ai = atmosOrder.indexOf(GameSettings.atmosphereTint);
                    GameSettings.atmosphereTint = atmosOrder[(ai + 1) % atmosOrder.length];
                    this._updateValueEl(el.id, GameSettings.atmosphereTint || 'off');
                    
                } else if (key === 'colorGrade') {
                    // Cycle the presets (a custom grade steps on to the first); the drawer fine-tunes
                    const gi = GAME_GRADE_PRESETS.findIndex(p => p.key === GameSettings.colorGrade);
                    applyGameGradePreset((gi + 1) % GAME_GRADE_PRESETS.length);
                    this._updateValueEl(el.id, GameSettings.colorGrade === 'none' ? 'none' : GameSettings.colorGrade.replace(/_/g, ' '));

                } else if (key === 'gradeDrawer') {
                    // The grade drawer lives in Cinematic View, over the world with no HUD in the way
                    this.closeSettings();
                    this.enterCinematic({ grade: true, back: 'settings' });

                } else if (key === 'finisher') {
                    const order = ['full', 'subtle', 'off'];
                    GameSettings.finisher = order[(order.indexOf(GameSettings.finisher || 'full') + 1) % order.length];
                    this._updateValueEl(el.id, GameSettings.finisher);

                } else if (key === 'soundRings') {
                    const order = ['mirage', 'simple', 'off'];
                    GameSettings.soundRings = order[(order.indexOf(GameSettings.soundRings || 'mirage') + 1) % order.length];
                    this._updateValueEl(el.id, GameSettings.soundRings);

                } else if (key === 'stealthGray') {
                    GameSettings.stealthGray = GameSettings.stealthGray === false;
                    this._updateValueEl(el.id, GameSettings.stealthGray ? 'on' : 'off');

                } else if (key === 'profiler') {
                    const order = ['off', 'compact', 'full'];
                    GameSettings.profilerMode = order[(order.indexOf(GameSettings.profilerMode || 'off') + 1) % order.length];
                    game.showProfiler = GameSettings.profilerMode !== 'off';
                    if (typeof DevOverlay !== 'undefined') DevOverlay.sync(game);
                    this._updateValueEl(el.id, GameSettings.profilerMode);

                } else if (key === 'debugView') {
                    game.debugMode = !game.debugMode;
                    if (typeof DevOverlay !== 'undefined') DevOverlay.sync(game);
                    this._updateValueEl(el.id, game.debugMode ? 'on' : 'off');

                } else if (key === 'devWeather') {
                    // Clear → Drizzle → Rain → Storm pin the sky (the schedule waits); Auto hands it back
                    const W = game.weather, cycle = ['auto', 'clear', 'drizzle', 'rain', 'storm'];
                    const cur = W.scheduleLocked ? W.condition : 'auto';
                    const next = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
                    if (next === 'auto') W.unlockSchedule(true); else W.lockSchedule(next);
                    this._updateValueEl(el.id, next);

                } else if (key === 'devWeaponMode') {
                    // Sniper mode: penetrating rounds
                    game.weaponMode = game.weaponMode === 'sniper' ? 'normal' : 'sniper';
                    showMessage(game.weaponMode === 'sniper' ? 'SNIPER MODE: PENETRATING ROUNDS ACTIVE' : 'NORMAL MODE: STANDARD ROUNDS ACTIVE');
                    this._updateValueEl(el.id, game.weaponMode);

                } else if (key === 'perfBench') {
                    // The resolution sweep (entities/static-builders-profiler.js PerfBench): back in the game to measure it
                    GameSettings.profilerMode = GameSettings.profilerMode === 'off' || !GameSettings.profilerMode ? 'compact' : GameSettings.profilerMode;
                    game.showProfiler = true;
                    if (typeof DevOverlay !== 'undefined') DevOverlay.sync(game);
                    this.closeSettings(); this.close();
                    PerfBench.run();
                    
                } else if (key === 'fpsLimit') {
                    // Cycle: NONE → 60 → 30 → NONE
                    if (GameSettings.fpsLimit === 0) GameSettings.fpsLimit = 60;
                    else if (GameSettings.fpsLimit === 60) GameSettings.fpsLimit = 30;
                    else GameSettings.fpsLimit = 0;
                    this._updateValueEl(el.id, GameSettings.fpsLimit === 0 ? 'none' : String(GameSettings.fpsLimit));
                    
                } else if (key === 'lightingQuality') {
                    // Cycle HIGH → MEDIUM → LOW
                    if (GameSettings.lightingQuality === 'high') {
                        GameSettings.lightingQuality = 'medium';
                        game.lightingScale = 0.75;
                    } else if (GameSettings.lightingQuality === 'medium') {
                        GameSettings.lightingQuality = 'low';
                        game.lightingScale = 0.5;
                    } else {
                        GameSettings.lightingQuality = 'high';
                        game.lightingScale = 1.0;
                    }
                    game.resize();
                    this._updateValueEl(el.id, GameSettings.lightingQuality);
                    
                } else {
                    // Density settings: cycle LOW → MEDIUM → HIGH
                    const order = ['low', 'medium', 'high'];
                    const current = GameSettings[key];
                    const idx = order.indexOf(current);
                    GameSettings[key] = order[(idx + 1) % 3];
                    this._updateValueEl(el.id, GameSettings[key]);
                }
                
                // Also sync main menu labels
                syncMainMenuLabels();
            }
        }
        
