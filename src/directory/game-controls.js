        // ===== LV2 DIRECTORY =====
        // The game's controls: which keys and buttons do what (dfKeyMap), and the actions they fire
        // (dfActions), handed to the Basement's controls system (basement/controls-system.js).
        // The HUD's buttons are touch inputs (dfTouchButtons). The touch sticks and gestures, the mouse
        // aim and the controller's menu highlight keep their own code: the joysticks, engine/events.js,
        // ui/gamepad.js.
        //
        // Who may fire what:
        //   PLAY  the game is running and unpaused, the HUD takes input, no text field has the key
        //   LIVE  the same, but also with the HUD blocked (E, F and T always worked over a hidden HUD)
        //   UI    no text field has the key and the pause menu is shut (M, P, B: map, phone, back)
        //   MENU  the pause menu is open
        // A controller only plays when menu mode is off (dfMenuMode): in a menu its buttons move the
        // highlight instead (ui/gamepad.js).
        const dfMenuMode = g => !g || !g.running || g.paused || hudInputBlocked() || !!(g.scenes && g.scenes.running);
        const dfPad = (g, ev) => ev.device !== 'gamepad' || !dfMenuMode(g);
        const PLAY = (g, ev) => !ev.typing && !!g && g.running && !g.paused && !hudInputBlocked() && dfPad(g, ev);
        const LIVE = (g, ev) => !ev.typing && !!g && g.running && !g.paused && dfPad(g, ev);
        const UI = (g, ev) => !ev.typing && !(typeof pauseMenu !== 'undefined' && pauseMenu.isOpen) && dfPad(g, ev);
        const MENU = (g, ev) => !ev.typing && typeof pauseMenu !== 'undefined' && pauseMenu.isOpen;
        const CHOOSING = (g, ev) => PLAY(g, ev) && g.furniture?.state === 'choose';
        const dfShown = el => !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none';

        const dfKeyMap = {
            move_up: ['w', 'ArrowUp'], move_down: ['s', 'ArrowDown'], move_left: ['a', 'ArrowLeft'], move_right: ['d', 'ArrowRight'],
            fire: [['space', REPEAT]],                          // the controller fires with RT on the aim stick (ui/gamepad.js)
            handbrake: ['space', 'gamepadLTrigger', 'touchHandbrake'],
            interact: ['e', 'gamepadA', 'touchInteract'],
            doors: ['f', 'gamepadY', 'touchDoors'],
            flit: ['gamepadB', 'touchFlit'],
            holster: ['gamepadX'],
            sneak: ['c', 'gamepadLBumper', 'touchSneak'],
            booster: ['h', ['gamepadRBumper', TAP], ['touchHeal', TAP]],
            booster_ally: ['j', ['gamepadRBumper', HELD, 0.3], ['touchHeal', HELD, 0.3]],
            furniture: ['g', ['touchGrab', TAP]],
            furniture_reset: [['touchGrab', HELD, 0.9]],
            furniture_turn: [['r', REPEAT], 'touchTurnRight'], furniture_turn_back: ['touchTurnLeft'],
            auto_drive: ['q', 'gamepadLStickButton', 'touchAutoDrive'],
            zib_skip: ['t', 'touchZibSkip'],
            map: ['m', 'gamepadBack'],
            phone: ['p', 'gamepadDUp'],
            night_vision: ['gamepadDDown', 'touchNightVision'],
            pause: ['touchPause'],
            screen_back: ['b'],
            back: ['Escape', 'gamepadStart'],
            menu_up: [['ArrowUp', REPEAT]], menu_down: [['ArrowDown', REPEAT]], menu_left: [['ArrowLeft', REPEAT]], menu_right: [['ArrowRight', REPEAT]],
            menu_select: ['Enter'],
        };

        /** Escape: the one way back out, whatever is open (cinematic, furniture, pause, phone, map, a shop), else pause. */
        function dfBack(g) {
            if (document.body.classList.contains('cinematic-view')) return pauseMenu.exitCinematic();
            if (g?.furniture?.busy()) return g.furniture.release();
            if (pauseMenu?.isOpen) return pauseMenu.close();
            if (phoneSystem.overlay.style.display === 'flex') return phoneSystem.close();
            if (Screens.mapOpen() || Screens.menuOpen()) return Screens.close();
            const SHOPS = [   // each through its own close, so its pause is released
                ['cosmetics-shop-overlay', () => document.getElementById('cosmetics-shop-close').click()],
                ['auto-shop-overlay', () => g.closeAutoShop()],
                ['augment-shop', () => document.getElementById('aug-shop-close').click()],
                ['craft-shop', () => document.getElementById('craft-shop-close').click()],
                ['dye-shop', () => document.getElementById('dye-shop-close').click()],
                ['zib-menu', () => g.closeZibMenu()],
                ['gauntlet-menu', () => g.closeGauntletMenu()],
                ['tuning-overlay', () => g.closeTuning()],
                ['vending-menu', () => g.closeVendingMenu()],
            ];
            for (const [id, close] of SHOPS) { const el = document.getElementById(id); if (el && getComputedStyle(el).display !== 'none') return close(); }
            if (g?.running && pauseMenu) pauseMenu.toggle(true);   // a deliberate pause works in a story scene too
        }
        /** Pause menu keys: they go no further (a scene behind the menu must not hear them). */
        const dfMenuKey = fn => (g, ev) => { ev.preventDefault(); ev.stop(); fn(); };
        /** While she chooses which side to lift furniture from, the direction keys pick it. */
        const dfSide = (dx, dy) => (g, ev) => { if (ev.device === 'keyboard') { g.furniture.chooseDir(dx, dy); ev.preventDefault(); } };

        const dfActions = [   // [action, when, run]
            ['move_up', CHOOSING, dfSide(0, -1)], ['move_down', CHOOSING, dfSide(0, 1)], ['move_left', CHOOSING, dfSide(-1, 0)], ['move_right', CHOOSING, dfSide(1, 0)],
            ['fire', PLAY, (g, ev) => { ev.preventDefault(); if (!g.isDriving && g.shootCooldown <= 0 && g.player.visible) g.fireWeapon(); }],   // driving, Space is the handbrake
            ['interact', LIVE, g => g.interact()],
            ['doors', LIVE, g => (dfShown(g.transitionBtn) || !g.isDriving && g.activeMap.transitions && g._transitionGrid.query(g.player.x, g.player.y)) && g.triggerTransition()],
            ['flit', (g, ev) => PLAY(g, ev) && !g.isDriving, (g, ev) => ev.device === 'gamepad' ? g.triggerFlit(undefined, 'pad') && controls.gamepad.rumble(90, 0.5) : g.triggerFlit()],
            ['holster', (g, ev) => PLAY(g, ev) && !g.isDriving, g => g._quickDraw ? (g.cancelQuickDraw(), g.setWeaponHolstered(false)) : g.setWeaponHolstered(!g.weaponHolstered)],
            ['sneak', (g, ev) => PLAY(g, ev) && !ev.ctrl && !g.isDriving, g => g.toggleSneak()],   // engine/sneak.js
            ['booster', PLAY, g => g.useBooster()],
            ['booster_ally', PLAY, g => g.useBoosterOnAlly()],
            ['furniture', (g, ev) => PLAY(g, ev) && !!g.furniture, g => g.furniture.press()],                 // engine/furniture.js: grab / confirm / let go
            ['furniture_reset', (g, ev) => PLAY(g, ev) && g.furniture?.state === 'idle', g => g.furniture.resetLayout()],   // hold the hand a moment
            ['furniture_turn', (g, ev) => PLAY(g, ev) && !!g.furniture?.holding, (g, ev) => g.furniture.rotate(ev.shift ? -1 : 1)],
            ['furniture_turn_back', (g, ev) => PLAY(g, ev) && !!g.furniture?.holding, g => g.furniture.rotate(-1)],
            ['auto_drive', (g, ev) => PLAY(g, ev) && g.isDriving, g => g.toggleAutoDrive()],
            ['zib_skip', (g, ev) => (ev.device === 'touch' || LIVE(g, ev)) && !!g.zibSystem?.isPassenger, g => { g.zibSystem.teleportToDestination(g); if (g.zibSkipBtn) g.zibSkipBtn.style.display = 'none'; }],
            ['map', UI, g => Screens.mapOpen() ? Screens.close() : g?.running && !g.paused && Screens.open('map')],   // the map holds a pause token
            ['phone', UI, g => phoneSystem.overlay.style.display === 'flex' ? phoneSystem.close() : !g?.paused && phoneSystem.open()],
            ['night_vision', PLAY, g => g.toggleNightVision()],
            ['pause', null, () => pauseMenu.isOpen ? pauseMenu.close() : pauseMenu.open()],   // the ⏸ button
            ['screen_back', UI, () => (Screens.mapOpen() || Screens.menuOpen()) && Screens.close()],
            ['back', dfPad, g => dfBack(g)],                   // Escape works in a text field too
            ['menu_up', MENU, dfMenuKey(() => pauseMenu.navigateUp())], ['menu_down', MENU, dfMenuKey(() => pauseMenu.navigateDown())],
            ['menu_left', MENU, dfMenuKey(() => pauseMenu.navigateLeft())], ['menu_right', MENU, dfMenuKey(() => pauseMenu.navigateRight())],
            ['menu_select', MENU, dfMenuKey(() => pauseMenu.selectCurrent())],
        ];

        /** The HUD's buttons as touch inputs (engine/events.js hands them over once the HUD exists). */
        const dfTouchButtons = [
            ['btn-interact', 'touchInteract'], ['btn-transition', 'touchDoors'], ['btn-heal', 'touchHeal'], ['btn-flit', 'touchFlit'],
            ['btn-autodrive', 'touchAutoDrive'], ['btn-handbrake', 'touchHandbrake'], ['btn-zib-skip', 'touchZibSkip'], ['btn-sneak', 'touchSneak'],
            ['btn-nv', 'touchNightVision'], ['btn-pause', 'touchPause'], ['btn-grab', 'touchGrab'], ['btn-rot-l', 'touchTurnLeft'], ['btn-rot-r', 'touchTurnRight'],
        ];

        const controls = new controlsSystem({ keymap: dfKeyMap, actions: dfActions, context: () => typeof game !== 'undefined' ? game : null });
