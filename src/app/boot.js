        // ═══ COLOUR GRADE ═══
        // The grade lives in Cinematic View's drawer (#cine-grade, ui/save-slots-pause-menu.js).
        // Exposure / brightness / contrast / saturation join the canvas filter chain each frame
        // (engine/draw.js); temperature and tint are a soft-light wash; the vignette a canvas shadow.
        // A saved photo bakes all three in (gradePhotoPass).
        const GAME_GRADE_DEFAULTS = {exposure:0, brightness:100, contrast:100, saturate:100, temp:0, tint:0, vignette:0};
        const GAME_GRADE_PRESETS = [
            {key:'none', name:'Reset', values:{...GAME_GRADE_DEFAULTS}},
            {key:'amber_night', name:'Amber Night', values:{exposure:5,brightness:95,contrast:130,saturate:110,temp:40,tint:-10,vignette:35}},
            {key:'violet_noir', name:'Violet Noir', values:{exposure:-5,brightness:90,contrast:140,saturate:80,temp:-25,tint:30,vignette:45}},
            {key:'crimson', name:'Crimson', values:{exposure:0,brightness:92,contrast:135,saturate:120,temp:30,tint:15,vignette:30}},
            {key:'cold_teal', name:'Cold Teal', values:{exposure:-8,brightness:95,contrast:125,saturate:75,temp:-45,tint:-15,vignette:25}},
            {key:'dreampunk', name:'Dreampunk', values:{exposure:3,brightness:93,contrast:145,saturate:95,temp:15,tint:20,vignette:50}},
        ];
        // [key, label, min, max, track]
        const GAME_GRADE_SLIDERS = [
            ['exposure', 'Exposure', -100, 100], ['brightness', 'Brightness', 50, 150], ['contrast', 'Contrast', 50, 200],
            ['saturate', 'Saturation', 0, 200], ['temp', 'Temp', -100, 100, 'linear-gradient(to right,#4488ff,#5a4a6a,#ffaa44)'],
            ['tint', 'Tint', -100, 100, 'linear-gradient(to right,#44cc66,#5a4a6a,#cc44aa)'], ['vignette', 'Vignette', 0, 100]
        ];
        let _gameGradeActive = 0;             // preset index, or -1 once a slider has been moved
        let _gameGrade = {...GAME_GRADE_DEFAULTS};

        /** A preset by index: becomes the grade, the setting and what the drawer shows */
        function applyGameGradePreset(idx) {
            const p = GAME_GRADE_PRESETS[idx] || GAME_GRADE_PRESETS[0];
            _gameGradeActive = GAME_GRADE_PRESETS.indexOf(p);
            _gameGrade = {...p.values};
            GameSettings.colorGrade = p.key; GameSettings.gradeCustom = null;
            applyGameGradeToCanvas(); syncGradeDrawer();
        }
        /** One slider moved: the grade becomes custom (kept in saves as gradeCustom) */
        function setGameGradeValue(k, v) {
            _gameGrade[k] = +v; _gameGradeActive = -1;
            GameSettings.colorGrade = 'custom'; GameSettings.gradeCustom = {..._gameGrade};
            applyGameGradeToCanvas(); syncGradeDrawer(k);
        }
        /** After a load (or at boot): whatever the settings say, back on screen */
        function restoreGameGrade() {
            if (GameSettings.colorGrade === 'custom' && GameSettings.gradeCustom) {
                _gameGrade = {...GAME_GRADE_DEFAULTS, ...GameSettings.gradeCustom}; _gameGradeActive = -1;
                applyGameGradeToCanvas(); syncGradeDrawer();
            } else applyGameGradePreset(Math.max(0, GAME_GRADE_PRESETS.findIndex(p => p.key === GameSettings.colorGrade)));
        }
        /** The temperature / tint wash: rgb and opacity (shared by the overlay and saved photos) */
        function gradeWash(g = _gameGrade) {
            if (!g.temp && !g.tint) return null;
            const tr = g.temp > 0 ? Math.round(g.temp * 2.5) : 0;
            const tb = g.temp < 0 ? Math.round(-g.temp * 2.5) : 0;
            const tg = g.tint < 0 ? Math.round(-g.tint * 1.5) : 0;
            const tm = g.tint > 0 ? Math.round(g.tint * 1.5) : 0;
            return { rgb: `rgb(${Math.min(255, 128 + tr - tb + tm)},${Math.min(255, 128 + tg - tm)},${Math.min(255, 128 + tb - tr + tm)})`,
                     alpha: Math.max(Math.abs(g.temp), Math.abs(g.tint)) / 200 };
        }
        function applyGameGradeToCanvas() {
            const c = document.getElementById('game-canvas'); if (!c) return;
            const g = _gameGrade;
            let ov = document.getElementById('grade-overlay');
            if (!ov) { ov = document.createElement('div'); ov.id = 'grade-overlay'; ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;mix-blend-mode:soft-light;'; c.parentElement.appendChild(ov); }
            const w = gradeWash(g);
            if (w) { ov.style.background = w.rgb; ov.style.opacity = w.alpha; ov.style.display = 'block'; }
            else ov.style.display = 'none';
            c.style.boxShadow = g.vignette > 0 ? 'inset 0 0 ' + (g.vignette * 2) + 'px ' + g.vignette + 'px rgba(0,0,0,' + (g.vignette / 100) + ')' : 'none';
        }
        /** Bake the wash and vignette into a photo (out: a canvas already holding the filtered frame) */
        function gradePhotoPass(out, cssW) {
            const ctx = out.getContext('2d'), g = _gameGrade, w = gradeWash(g);
            if (w) {
                ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = w.alpha;
                ctx.fillStyle = w.rgb; ctx.fillRect(0, 0, out.width, out.height); ctx.restore();
            }
            if (g.vignette > 0) {
                // the inset box-shadow, in backing pixels: blur 2v + spread v (CSS px) from every edge
                const k = out.width / (cssW || out.width), reach = g.vignette * 3 * k;
                const a = g.vignette / 100;
                ctx.save();
                for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
                    [0, 0, 0, reach, 0, 0, out.width, reach], [0, out.height, 0, out.height - reach, 0, out.height - reach, out.width, reach],
                    [0, 0, reach, 0, 0, 0, reach, out.height], [out.width, 0, out.width - reach, 0, out.width - reach, 0, reach, out.height]]) {
                    const gr = ctx.createLinearGradient(x0, y0, x1, y1);
                    gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.33, `rgba(0,0,0,${a * 0.85})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = gr; ctx.fillRect(rx, ry, rw, rh);
                }
                ctx.restore();
            }
        }
        /** Build (once) and refresh the drawer: preset chips, sliders, colour chips */
        function syncGradeDrawer(skipKey) {
            const box = document.getElementById('cine-grade'); if (!box) return;
            const P = box.querySelector('.cg-presets'), S = box.querySelector('.cg-sliders');
            if (P && !P.childElementCount) {
                GAME_GRADE_PRESETS.forEach((p, i) => {
                    const b = document.createElement('button'); b.className = 'df-chip cg-preset'; b.dataset.preset = i; b.textContent = p.name; P.appendChild(b);
                });
            }
            if (S && !S.childElementCount) {
                for (const [k, label, lo, hi, track] of GAME_GRADE_SLIDERS) {
                    const row = document.createElement('label'); row.className = 'cg-row';
                    row.innerHTML = `<span class="cg-label">${label}</span><input type="range" class="cg-slider" data-k="${k}" min="${lo}" max="${hi}" step="1"${track ? ` style="--cg-track:${track}"` : ''}><span class="cg-val" data-v="${k}"></span>`;
                    S.appendChild(row);
                }
            }
            P?.querySelectorAll('.cg-preset').forEach(b => b.classList.toggle('active', +b.dataset.preset === _gameGradeActive));
            S?.querySelectorAll('.cg-slider').forEach(el => { if (el.dataset.k !== skipKey) el.value = _gameGrade[el.dataset.k]; });
            S?.querySelectorAll('.cg-val').forEach(el => { el.textContent = _gameGrade[el.dataset.v]; });
            const full = !!GameSettings.photoFullColour;
            box.querySelector('[data-cg="seen"]')?.classList.toggle('active', !full);
            box.querySelector('[data-cg="full"]')?.classList.toggle('active', full);
            const refl = GameSettings.photoReflections !== false;
            box.querySelector('[data-cg="refl-on"]')?.classList.toggle('active', refl);
            box.querySelector('[data-cg="refl-off"]')?.classList.toggle('active', !refl);
        }
        
        const saveSlotManager = new SaveSlotManager();
        const pauseMenu = new PauseMenuController();
        window.pauseMenuController = pauseMenu;
        FullscreenManager.init();
        restoreGameGrade();
        
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
            const onOff = k => GameSettings[k] ? 'ON' : 'OFF', onCol = k => GameSettings[k] ? '' : '#666';
            lbl('lbl-flitring', `Flit Ring: ${onOff('flitRing')}`, onCol('flitRing'));
            lbl('lbl-flitflick', `Flick to Flit: ${onOff('flitFlick')}`, onCol('flitFlick'));
            lbl('lbl-flittwo', `Two-Finger Flit: ${onOff('flitTwoFinger')}`, onCol('flitTwoFinger'));
            lbl('lbl-flitbtn', `Flit Button: ${onOff('flitButton')}`, onCol('flitButton'));
            lbl('lbl-aimfire', `Aim Before Firing: ${onOff('aimBeforeFire')}`, onCol('aimBeforeFire'));
            lbl('lbl-sniperrelease', `Sniper Fire on Release: ${onOff('sniperRelease')}`, onCol('sniperRelease'));
            lbl('lbl-scopeview', `Scope View: ${onOff('scopeView')}`, onCol('scopeView'));
            lbl('lbl-scopeslow', `Scope Slow-Mo: ${onOff('scopeSlow')}`, onCol('scopeSlow'));
            lbl('lbl-audio', `Master Audio: ${GameSettings.audioEnabled ? 'ON' : 'OFF'}`,
                GameSettings.audioEnabled ? '' : '#666');
            lbl('lbl-fps', `FPS Limit: ${GameSettings.fpsLimit === 0 ? 'NONE' : GameSettings.fpsLimit}`,
                GameSettings.fpsLimit > 0 ? '#4CAF50' : '');
            syncAmbienceSliders();
        }

        // Ambience and Music volume: each one setting, two sliders (main menu + pause panel), kept in step
        function syncAmbienceSliders() {
            for (const [key, name, label] of [['ambienceVolume', 'ambience', 'Ambience'], ['musicVolume', 'music', 'Music']]) {
                const v = Math.round((GameSettings[key] ?? 0.7) * 100);
                for (const id of [`main-${name}`, `set-${name}`]) { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = v; }
                const a = document.getElementById(`lbl-${name}`); if (a) a.textContent = `${label}: ${v}`;
                const b = document.getElementById(`set-${name}-val`); if (b) b.textContent = v;
            }
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
        function setMusicVolume(v) {
            audioSys.init();
            audioSys.setMusicVolume(v);
            try { localStorage.setItem('dfab_music_volume', String(GameSettings.musicVolume)); } catch (e) { /* private mode */ }
            syncAmbienceSliders();
        }
        for (const id of ['main-music', 'set-music']) {
            const el = document.getElementById(id);
            if (!el) continue;
            el.addEventListener('input', () => setMusicVolume(el.value / 100));
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
        
        // Flit controls (touch): ring, flick, two-finger tap, the ⚡ button
        for (const [id, key] of [['btn-toggle-flitring', 'flitRing'], ['btn-toggle-flitflick', 'flitFlick'], ['btn-toggle-flittwo', 'flitTwoFinger'], ['btn-toggle-flitbtn', 'flitButton'], ['btn-toggle-aimfire', 'aimBeforeFire'], ['btn-toggle-sniperrelease', 'sniperRelease'], ['btn-toggle-scopeview', 'scopeView'], ['btn-toggle-scopeslow', 'scopeSlow']]) {
            document.getElementById(id).addEventListener('click', () => {
                GameSettings[key] = !GameSettings[key];
                GameSettings.applyControls();
                syncMainMenuLabels();
            });
        }
        
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

