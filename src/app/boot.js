        // ═══ COLOR GRADE PANEL SYSTEM ═══
        const GAME_GRADE_DEFAULTS = {exposure:0, brightness:100, contrast:100, saturate:100, temp:0, tint:0, vignette:0};
        const GAME_GRADE_PRESETS = [
            {name:'Reset', values:{...GAME_GRADE_DEFAULTS}},
            {name:'Amber Night', values:{exposure:5,brightness:95,contrast:130,saturate:110,temp:40,tint:-10,vignette:35}},
            {name:'Violet Noir', values:{exposure:-5,brightness:90,contrast:140,saturate:80,temp:-25,tint:30,vignette:45}},
            {name:'Crimson', values:{exposure:0,brightness:92,contrast:135,saturate:120,temp:30,tint:15,vignette:30}},
            {name:'Cold Teal', values:{exposure:-8,brightness:95,contrast:125,saturate:75,temp:-45,tint:-15,vignette:25}},
            {name:'Dreampunk', values:{exposure:3,brightness:93,contrast:145,saturate:95,temp:15,tint:20,vignette:50}},
        ];
        let _gameGradeActive = 0;
        let _gameGrade = {...GAME_GRADE_DEFAULTS};
        
        function initGameGradePresets() {
            const c = document.getElementById('ggpPresets'); if (!c) return; c.innerHTML = '';
            GAME_GRADE_PRESETS.forEach((p, i) => {
                const btn = document.createElement('span'); btn.className = 'ggp-preset' + (i === _gameGradeActive ? ' active' : '');
                btn.textContent = p.name; btn.onclick = () => applyGameGradePreset(i); c.appendChild(btn);
            });
        }
        function applyGameGradePreset(idx) {
            _gameGradeActive = idx;
            _gameGrade = {...GAME_GRADE_PRESETS[idx].values};
            Object.keys(GAME_GRADE_DEFAULTS).forEach(k => {
                const el = document.getElementById('ggp' + k.charAt(0).toUpperCase() + k.slice(1));
                if (el) el.value = _gameGrade[k];
                const val = document.getElementById('ggp' + k.charAt(0).toUpperCase() + k.slice(1) + 'Val');
                if (val) val.textContent = _gameGrade[k];
            });
            updateGameGrade();
            initGameGradePresets();
        }
        function updateGameGrade() {
            Object.keys(GAME_GRADE_DEFAULTS).forEach(k => {
                const el = document.getElementById('ggp' + k.charAt(0).toUpperCase() + k.slice(1));
                if (el) { _gameGrade[k] = +el.value;
                    const val = document.getElementById('ggp' + k.charAt(0).toUpperCase() + k.slice(1) + 'Val');
                    if (val) val.textContent = el.value;
                }
            });
            applyGameGradeToCanvas();
        }
        function applyGameGradeToCanvas() {
            const c = document.getElementById('game-canvas'); if (!c) return;
            const g = _gameGrade;
            // NOTE: brightness/contrast/saturate/exposure are merged into the game's
            // per-frame CSS filter chain (section 6 of render pipeline). We only
            // handle temperature, tint, and vignette here via DOM overlays.
            
            // Temperature + tint overlay
            let ov = document.getElementById('grade-overlay');
            if (!ov) { ov = document.createElement('div'); ov.id = 'grade-overlay'; ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;mix-blend-mode:soft-light;'; c.parentElement.appendChild(ov); }
            if (g.temp !== 0 || g.tint !== 0) {
                const tr = g.temp > 0 ? Math.round(g.temp * 2.5) : 0;
                const tb = g.temp < 0 ? Math.round(-g.temp * 2.5) : 0;
                const tg = g.tint < 0 ? Math.round(-g.tint * 1.5) : 0;
                const tm = g.tint > 0 ? Math.round(g.tint * 1.5) : 0;
                ov.style.background = 'rgb(' + Math.min(255, 128 + tr - tb + tm) + ',' + Math.min(255, 128 + tg - tm) + ',' + Math.min(255, 128 + tb - tr + tm) + ')';
                ov.style.opacity = Math.max(Math.abs(g.temp), Math.abs(g.tint)) / 200;
                ov.style.display = 'block';
            } else { ov.style.display = 'none'; }
            // Vignette
            if (g.vignette > 0) { c.style.boxShadow = 'inset 0 0 ' + (g.vignette * 2) + 'px ' + g.vignette + 'px rgba(0,0,0,' + (g.vignette / 100) + ')'; }
            else { c.style.boxShadow = 'none'; }
        }
        
        const saveSlotManager = new SaveSlotManager();
        const pauseMenu = new PauseMenuController();
        window.pauseMenuController = pauseMenu;
        FullscreenManager.init();
        
        // --- MENU LOGIC ---
        const settingsList = document.getElementById('settings-menu-list');
        const btnLighting = document.getElementById('lbl-lighting');
        
        // Open Settings
        document.getElementById('btn-settings').addEventListener('click', () => {
            mainMenuList.classList.add('hidden');
            settingsList.classList.remove('hidden');
        });
        
        // Back Button
        document.getElementById('btn-settings-back').addEventListener('click', () => {
            settingsList.classList.add('hidden');
            mainMenuList.classList.remove('hidden');
        });
        
        // --- SETTINGS CYCLE HELPER ---
        function cycleDensity(key) {
            const order = ['low', 'medium', 'high'];
            const idx = order.indexOf(GameSettings[key]);
            GameSettings[key] = order[(idx + 1) % 3];
            return GameSettings[key].toUpperCase();
        }
        
        function syncMainMenuLabels() {
            const lbl = (id, text, color) => {
                const el = document.getElementById(id);
                if (el) { el.textContent = text; el.style.color = color || ''; }
            };
            const dColor = (v) => v === 'low' ? '#4CAF50' : v === 'medium' ? '#FFD700' : '';
            
            lbl('lbl-lighting', `Lighting: ${GameSettings.lightingQuality.toUpperCase()}`, 
                GameSettings.lightingQuality === 'low' ? '#ffaa00' : '');
            lbl('lbl-traffic', `Traffic: ${GameSettings.trafficDensity.toUpperCase()}`,
                dColor(GameSettings.trafficDensity));
            lbl('lbl-peds', `Pedestrians: ${GameSettings.pedestrianDensity.toUpperCase()}`,
                dColor(GameSettings.pedestrianDensity));
            lbl('lbl-foliage', `Foliage: ${GameSettings.foliageDensity.toUpperCase()}`,
                dColor(GameSettings.foliageDensity));
            lbl('lbl-grain', `Film Grain: ${GameSettings.filmGrain ? 'ON' : 'OFF'}`,
                GameSettings.filmGrain ? '' : '#666');
            lbl('lbl-softshadows', `Soft Shadows: ${GameSettings.softShadows ? 'ON' : 'OFF'}`,
                GameSettings.softShadows ? '#ffaa00' : '#666');
            lbl('lbl-audio', `Master Audio: ${GameSettings.audioEnabled ? 'ON' : 'OFF'}`,
                GameSettings.audioEnabled ? '' : '#666');
            lbl('lbl-fps', `FPS Limit: ${GameSettings.fpsLimit === 0 ? 'NONE' : GameSettings.fpsLimit}`,
                GameSettings.fpsLimit > 0 ? '#4CAF50' : '');
            syncAmbienceSliders();
        }

        // Ambience volume: one setting, two sliders (main menu + pause panel), kept in step
        function syncAmbienceSliders() {
            const v = Math.round((GameSettings.ambienceVolume ?? 0.7) * 100);
            for (const id of ['main-ambience', 'set-ambience']) { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = v; }
            const a = document.getElementById('lbl-ambience'); if (a) a.textContent = `Ambience: ${v}`;
            const b = document.getElementById('set-ambience-val'); if (b) b.textContent = v;
        }
        let _ambPreviewAt = 0;
        function setAmbienceVolume(v) {
            GameSettings.ambienceVolume = Math.max(0, Math.min(1, v));
            try { localStorage.setItem('dfab_ambience_volume', String(GameSettings.ambienceVolume)); } catch (e) { /* private mode */ }
            syncAmbienceSliders();
            const now = performance.now();
            if (now - _ambPreviewAt > 180 && GameSettings.ambienceVolume > 0) { _ambPreviewAt = now; audioSys.init(); audioSys.sfx('ui'); }
        }
        for (const id of ['main-ambience', 'set-ambience']) {
            const el = document.getElementById(id);
            if (!el) continue;
            el.addEventListener('input', () => setAmbienceVolume(el.value / 100));
            for (const ev of ['click', 'pointerdown', 'touchstart', 'keydown']) el.addEventListener(ev, e => e.stopPropagation());
        }
        syncAmbienceSliders();
        
        // Toggle Lighting Quality
        document.getElementById('btn-toggle-lighting').addEventListener('click', () => {
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
            syncMainMenuLabels();
        });
        
        // Toggle Traffic Density
        document.getElementById('btn-toggle-traffic').addEventListener('click', () => {
            cycleDensity('trafficDensity');
            syncMainMenuLabels();
        });
        
        // Toggle Pedestrian Density
        document.getElementById('btn-toggle-peds').addEventListener('click', () => {
            cycleDensity('pedestrianDensity');
            syncMainMenuLabels();
        });
        
        // Toggle Foliage Density
        document.getElementById('btn-toggle-foliage').addEventListener('click', () => {
            cycleDensity('foliageDensity');
            syncMainMenuLabels();
        });
        
        // Toggle Film Grain
        document.getElementById('btn-toggle-grain').addEventListener('click', () => {
            GameSettings.filmGrain = !GameSettings.filmGrain;
            GameSettings.applyFilmGrain();
            syncMainMenuLabels();
        });
        
        // Toggle Soft Shadows
        document.getElementById('btn-toggle-softshadows').addEventListener('click', () => {
            GameSettings.softShadows = !GameSettings.softShadows;
            syncMainMenuLabels();
        });
        
        // Toggle Master Audio
        document.getElementById('btn-toggle-audio').addEventListener('click', () => {
            audioSys.setEnabled(!GameSettings.audioEnabled);
            syncMainMenuLabels();
        });
        
        // Toggle FPS Limit
        document.getElementById('btn-toggle-fps').addEventListener('click', () => {
            if (GameSettings.fpsLimit === 0) GameSettings.fpsLimit = 60;
            else if (GameSettings.fpsLimit === 60) GameSettings.fpsLimit = 30;
            else GameSettings.fpsLimit = 0;
            syncMainMenuLabels();
        });

