        // ===== LV2 DIRECTORY =====
        // GameEngine: the game's session flow. Menu -> world (enterWorld, the loading screen steps, loading a
        // save from the menu) and world -> menu (stop). Game-specific: it knows this game's DOM, audio and
        // systems. It starts and stops the Lobby's loop by way of game.running and game.loop().
        // Moved verbatim from engine/loop.js. Methods are added to GameEngine.prototype (engineMixin, engine/game-engine.js).
        engineMixin({
            /** From the menu into the world: hide the menu layer, show the canvas, start the loop. */
            enterWorld() {
                if (this.running) return;                                      // a second tap during the fade: one loop only
                if (!this.level_stages.go('world')) this._enterWorldStage();
            },

            /** The Lobby's stages (lobby/level-stages.js), as this game plays them. 'loading' has no jacks:
             *  the loading screen (app/boot-loader.js) covers the switch on its own. */
            _plugInStages() {
                this.level_stages.plugIn({
                    world: { enter: () => this._enterWorldStage(), leave: () => this._leaveWorldStage() }
                });
            },

            /** Into the world: hide the menu layer, show the canvas, start the loop. */
            _enterWorldStage() {
                if (typeof audioSys !== 'undefined') audioSys.wake();
                const ttb = document.getElementById('tap-to-begin'); if (ttb) ttb.remove();
                uiKit.hide('ui-layer');
                uiKit.show('game-container');
                this.running = true;
                this.loop();
            },
            /**
             * From the menu into the world under the loading screen (app/boot-loader.js): run the steps (each
             * { label, weight, run(progress) }), with a painted frame between them, then fade the screen away.
             * The last step usually calls enterWorld() and _settleUnderLoader(), so the world's first, costly
             * frames are drawn while the loading screen still covers them. Resolves true if every step ran.
             */
            async loadIntoWorld(steps) {
                if (this._loadingIntoWorld) return false;                      // a second tap while one is under way
                this._loadingIntoWorld = true;
                const back = this.level_stages.stage;
                this.level_stages.go('loading');
                try { await LoadingScreen.run(steps); return true; }
                catch (e) { return false; }                                     // (the loading screen says what broke)
                finally {
                    this._loadingIntoWorld = false;
                    if (this.level_stages.is('loading')) this.level_stages.go(back);   // it never reached the world
                }
            },

            /** Load Saved Game from the menu: `load` runs the slot's load (true if it worked) under the loading screen */
            async loadSaveFromMenu(load) {
                const menu = document.getElementById('main-menu');
                let loaded = false;
                if (menu) menu.style.opacity = '0';
                const ok = await this.loadIntoWorld([
                    { label: 'Reading your imprint', weight: 1, run: () => {} },
                    { label: 'Rebuilding the world', weight: 6, run: () => {
                        if (!this.running) this.resetGameState();      // from a clean slate: nothing the save leaves out comes from the run before
                        loaded = !!load();
                        if (!loaded) throw new Error('That save could not be loaded.');
                    } },
                    { label: 'Painting the streets', weight: 3, run: (progress) => this._warmTexturesUnderLoader(progress) },
                    { label: 'Stepping in', weight: 2, run: (progress) => { this.enterWorld(); return this._settleUnderLoader(progress); } }
                ]);
                // Nothing loaded: back to the menu once the loading screen has said so
                if (!ok && !loaded && menu && !this.running) menu.style.opacity = '1';
                return ok;
            },

            /** Under the loading screen: paint the arriving map's first textures (engine/map-loading.js), a job a task */
            _warmTexturesUnderLoader(progress) {
                return new Promise(resolve => {
                    const fade = document.getElementById('fade-overlay');
                    let timer = 0;
                    const report = () => { const w = this._mapTextureWarmup; if (w && w.jobs.length) progress(w.index / w.jobs.length); };
                    // The menu still held the last run's map, so this load went through the door fade: that already
                    // warms the textures and lifts the fade when done. Wait it out.
                    if (this._mapTextureTransition || (fade && fade.classList.contains('active'))) {
                        const tick = () => {
                            report();
                            if (!this._mapTextureTransition && !(fade && fade.classList.contains('active'))) resolve();
                            else timer = setTimeout(tick, 50);
                        };
                        tick();
                        return;
                    }
                    if (!this.activeMap) { resolve(); return; }
                    timer = setInterval(report, 50);
                    this._prepareMapTextures(() => { clearInterval(timer); resolve(); }, this._loadSeq);
                });
            },

            /** Under the loading screen: let the world draw its first frames (the ones that paint caches and stutter),
             *  until a few come in quick succession, or a second and a half has gone. */
            _settleUnderLoader(progress, { frames = 12, quick = 4, maxMs = 1500 } = {}) {
                return new Promise(resolve => {
                    const t0 = performance.now();
                    let last = t0, n = 0, run = 0;
                    const tick = (now) => {
                        n++; run = (now - last < 34) ? run + 1 : 0; last = now;
                        progress(Math.min(1, Math.max(n / frames, (now - t0) / maxMs)));
                        if ((n >= frames && run >= quick) || now - t0 > maxMs || !this.running) resolve();
                        else requestAnimationFrame(tick);
                    };
                    requestAnimationFrame(tick);
                });
            },

            /** Back to the menu: leave the world (from anywhere, as it always could be called), then a fresh game state. */
            stop() {
                const from = this.level_stages.stage;
                this.level_stages.go('menu');
                if (from !== 'world') this._leaveWorldStage();                  // (the world's leave jack did it otherwise)
                // Reset all gameplay state so New Game starts fresh
                this.resetGameState();
            },

            /** Out of the world: stop the loop and everything of the run, then show the menu layer. */
            _leaveWorldStage() {
                this.running = false;
                ambience.silence();
                // Nothing of the run keeps going behind the menu: a ringing call, the car's hum, the radio, an open dialogue
                if (typeof phoneSystem !== 'undefined' && phoneSystem.endCall) phoneSystem.endCall();
                if (typeof audioSys !== 'undefined') { audioSys.engine({ on: false }); audioSys.tyres(0); audioSys.idle(); }
                if (this.musicWidget && this.musicWidget.isPlaying) this.musicWidget.togglePlay(false);
                if (this.dialogueBox && this.dialogueBox.style.display !== 'none') this.endDialogue();
                this.pauseSystem.clear();
                uiKit.hide('game-container'); 
                uiKit.show('ui-layer', 'flex'); 
                document.getElementById('main-menu').style.opacity = '1'; 
                document.getElementById('main-menu-list').classList.remove('hidden'); 
                document.getElementById('story-mode-list').classList.add('hidden');
            },
            
        });
