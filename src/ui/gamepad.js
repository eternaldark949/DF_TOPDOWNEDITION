        /* =========================================================================
           GAMEPAD — controller support through the browser Gamepad API.

           It writes into the same input state the touch sticks use, so movement,
           aiming, driving and firing need no new paths in the engine:
             left stick  → game.joystick       (analog walk / steer, like the move stick)
             right stick → game.fireJoystick   (aim; RT fires, like pushing past the ring)
           The controls system (basement/controls-system.js) reads the pad; in play its
           buttons are actions in the keymap (directory/game-controls.js), like the keys.

           This runs every frame after the pad is read, whether or not the game is paused,
           so the pad also works the title screen and every menu: the D-pad or left
           stick moves a highlight between the visible things you can click, A clicks
           it, B goes back (Escape), Start pauses. Standard mapping (Xbox names):

             A  interact / confirm        B  flit / back          X  holster · draw
             Y  doors & exits             LB sneak                RB booster (hold: ally)
             LT handbrake (driving)       RT fire                 L3 auto-drive (driving)
             Back  map                    Start pause             D-pad ↑ phone · ↓ night vision
           ========================================================================= */
        const GamepadInput = (() => {
            const P = controls.gamepad;                          // basement/controls-system.js reads the pad
            const B = { A: 'gamepadA', B: 'gamepadB', START: 'gamepadStart', BACK: 'gamepadBack', UP: 'gamepadDUp', DOWN: 'gamepadDDown', LEFT: 'gamepadDLeft', RIGHT: 'gamepadDRight' };
            const MOVE_DEAD = 0.18, AIM_DEAD = 0.3, NAV_DEAD = 0.55;
            const REPEAT_FIRST = 380, REPEAT_NEXT = 110;          // ms: held D-pad / stick in menus

            const state = { focus: null, navDir: null, navAt: 0, autoAt: 0, aDown: null, ownsMove: false, ownsAim: false, lastMode: null, had: false };

            const pressed = (i) => P.input_active.has(i);
            const down = (i) => P.input_just_activated.has(i);
            const up = (i) => P.input_just_released.has(i);
            const key = (k) => {                                // the keyboard paths already handle Escape, Enter …
                const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
                target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
                target.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true }));
            };
            /** Half of a mouse click on el's centre: 'down' (pointerdown, mousedown) or 'up' (pointerup, mouseup, click). */
            const mouse = (el, phase) => {
                const r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, buttons: phase === 'down' ? 1 : 0, pointerId: 99, pointerType: 'mouse', isPrimary: true };
                if (phase === 'down') { el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new MouseEvent('mousedown', o)); }
                else { el.dispatchEvent(new PointerEvent('pointerup', o)); el.dispatchEvent(new MouseEvent('mouseup', o)); el.dispatchEvent(new MouseEvent('click', o)); }
            };

            // ── Gameplay ────────────────────────────────────────────────────────
            function releaseSticks(g) {
                if (state.ownsMove && g.joystick.id === 'pad') Object.assign(g.joystick, { active: false, dx: 0, dy: 0, id: null });
                if (state.ownsAim && g.fireJoystick.id === 'pad') {
                    Object.assign(g.fireJoystick, { active: false, dx: 0, dy: 0, id: null, aimed: false, firing: false, armed: false });
                    document.getElementById('game-ui')?.classList.remove('aiming');
                }
                state.ownsMove = state.ownsAim = false;
                g.handbrakeHeld = false;
            }

            /** Play: the sticks feed the same state the touch sticks do. The buttons are actions (directory/game-controls.js). */
            function gameplay(g) {
                const J = g.joystick, F = g.fireJoystick;
                // Left stick: walk / steer — unless a finger already has the move stick
                const L = P.stick('left', MOVE_DEAD);
                if (J.id === null || J.id === 'pad') {
                    if (L.m > 0) { Object.assign(J, { active: true, id: 'pad', dx: L.x, dy: L.y }); state.ownsMove = true; }
                    else if (state.ownsMove) { Object.assign(J, { active: false, id: null, dx: 0, dy: 0 }); state.ownsMove = false; }
                }

                // Right stick aims; RT fires (along the stick, or straight ahead with no stick)
                const R = P.stick('right', AIM_DEAD);
                const rt = pressed('gamepadRTrigger'), canAim = !g.weaponHolstered || g._quickDraw || g.isDriving;
                if (F.id === null || F.id === 'pad') {
                    if (canAim && (R.m > 0 || rt)) {
                        let dx = R.x, dy = R.y;
                        if (!R.m) {                              // no stick: keep the last pad aim, or face where she faces
                            if (state.ownsAim && F.aimed) { dx = F.dx; dy = F.dy; }
                            else { dx = Math.cos(g.player.angle); dy = Math.sin(g.player.angle); }
                        }
                        const m = Math.hypot(dx, dy) || 1;
                        const quick = !!g._quickDraw;
                        Object.assign(F, { active: true, id: 'pad', aimed: true, dx: dx / m, dy: dy / m, firing: rt && !quick, armed: rt && quick });
                        if (!state.ownsAim) document.getElementById('game-ui')?.classList.add('aiming');
                        state.ownsAim = true;
                    } else if (state.ownsAim) {
                        Object.assign(F, { active: false, id: null, aimed: false, firing: false, armed: false, dx: 0, dy: 0 });
                        document.getElementById('game-ui')?.classList.remove('aiming');
                        state.ownsAim = false;
                    }
                    // Quick draw fires on release, like lifting the thumb off the fire stick
                    if (g._quickDraw && up('gamepadRTrigger')) g.requestQuickDraw(Math.atan2(F.dy || Math.sin(g.player.angle), F.dx || Math.cos(g.player.angle)));
                }
                // LT is the handbrake (the 'handbrake' action, read by engine/update.js): light its button
                const hb = !!(g.isDriving && pressed('gamepadLTrigger'));
                if (hb !== !!state.hb) { state.hb = hb; document.getElementById('btn-handbrake')?.classList.toggle('held', hb || g.handbrakeHeld); }
            }

            // ── Menus: a highlight that moves between the visible clickable things ──
            const CLICKABLE = 'button, a[href], [role="button"], [tabindex]:not([tabindex="-1"]), input:not([type="hidden"]), select, .menu-item-row, .df-chip, .game-btn';
            /** Shown, enabled, on screen and on top at its centre (so the HUD behind a menu is skipped). */
            function isLive(el) {
                if (!el || !el.isConnected || el.disabled || el.inert || el.closest('[inert]')) return false;
                const W = window.innerWidth, H = window.innerHeight, r = el.getBoundingClientRect();
                if (r.width < 4 || r.height < 4 || r.right < 0 || r.bottom < 0 || r.left > W || r.top > H) return false;
                const cx = Math.min(W - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(H - 1, Math.max(0, r.top + r.height / 2));
                const hit = document.elementFromPoint(cx, cy);
                return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
            }
            function candidates() {
                const out = [];
                for (const el of document.querySelectorAll('body *')) {
                    if (el.closest('#game-canvas, svg, canvas')) continue;
                    if (!el.matches(CLICKABLE) && getComputedStyle(el).cursor !== 'pointer') continue;
                    if (!isLive(el)) continue;
                    if (out.some(o => o.contains(el))) continue;  // the outermost clickable wins (a row, not its label)
                    out.push(el);
                }
                return out;
            }
            const readingOrder = (a, b) => { const p = a.getBoundingClientRect(), q = b.getBoundingClientRect(); return (p.top - q.top) || (p.left - q.left); };
            /** A menu just opened (or the highlighted item went away): highlight its first item. A story scene keeps
                no highlight, so A advances the line; a dialogue box starts on its "next" arrow. */
            function autoFocus(g) {
                const next = document.getElementById('btn-dialogue-next');
                if (isLive(next)) { setFocus(next); return; }
                if (g && g.running && !g.paused && g.scenes && g.scenes.running) { setFocus(null); return; }
                const list = candidates().sort(readingOrder);
                setFocus(list[0] || null);
            }
            function setFocus(el) {
                if (state.focus) state.focus.classList.remove('pad-focus');
                state.focus = el;
                if (!el) return;
                el.classList.add('pad-focus');
                try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
                el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
            function move(dx, dy) {
                const list = candidates();
                if (!list.length) { setFocus(null); return; }
                const cur = state.focus && list.includes(state.focus) ? state.focus : null;
                if (!cur) { setFocus(list.sort(readingOrder)[0]); return; }
                // A slider takes left/right itself
                if (cur.matches('input[type="range"]') && dx) {
                    const step = +cur.step || 1; cur.value = +cur.value + dx * step;
                    cur.dispatchEvent(new Event('input', { bubbles: true })); cur.dispatchEvent(new Event('change', { bubbles: true }));
                    return;
                }
                const c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
                let best = null, bestScore = Infinity;
                for (const el of list) {
                    if (el === cur) continue;
                    const r = el.getBoundingClientRect(), ox = r.left + r.width / 2 - cx, oy = r.top + r.height / 2 - cy;
                    const along = ox * dx + oy * dy, across = Math.abs(ox * dy - oy * dx);
                    if (along <= 1) continue;                   // only things in that direction
                    const score = along + across * 2.5;
                    if (score < bestScore) { bestScore = score; best = el; }
                }
                if (best) setFocus(best);
            }
            function menus(g) {
                // Direction: D-pad, or the left stick past halfway; held → repeats
                const [ax, ay] = P.left_stick_value;
                let dir = null;
                if (pressed(B.UP) || ay < -NAV_DEAD) dir = 'up';
                else if (pressed(B.DOWN) || ay > NAV_DEAD) dir = 'down';
                else if (pressed(B.LEFT) || ax < -NAV_DEAD) dir = 'left';
                else if (pressed(B.RIGHT) || ax > NAV_DEAD) dir = 'right';
                const now = performance.now();
                if (!dir && now >= state.autoAt) { state.autoAt = now + 200; if (!isLive(state.focus)) autoFocus(g); }
                if (dir && (dir !== state.navDir || now >= state.navAt)) {
                    state.navAt = now + (dir !== state.navDir ? REPEAT_FIRST : REPEAT_NEXT);
                    const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
                    move(D[0], D[1]);
                }
                state.navDir = dir;
                // Right stick scrolls whatever list is under the highlight
                const ry = P.right_stick_value[1];
                if (Math.abs(ry) > AIM_DEAD) {
                    let s = state.focus || document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
                    while (s && s !== document.body && !(s.scrollHeight > s.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
                    if (s && s !== document.body) s.scrollTop += ry * 14;
                }
                // A presses the highlighted item the way a mouse does (down on press, up + click on release),
                // so buttons wired to pointerdown, mousedown, pointerup or click all answer, and hold buttons hold
                if (down(B.A)) {
                    const el = state.focus;
                    if (isLive(el) && el.matches('input:not([type="checkbox"]):not([type="radio"]), select, textarea')) el.focus();
                    else if (isLive(el)) { state.aDown = el; mouse(el, 'down'); }
                    else key('Enter');                          // nothing highlighted: advance a line
                }
                if (up(B.A) && state.aDown) { const el = state.aDown; state.aDown = null; if (el.isConnected) mouse(el, 'up'); }
                if (down(B.B) || down(B.START)) key('Escape');
                if (down(B.BACK) && (Screens.mapOpen() || Screens.menuOpen())) Screens.close();
            }

            // ── Each frame, after the controls system has read the pad ─────────────
            function frame() {
                if (!P.connected) { if (state.had) { state.had = false; if (typeof game !== 'undefined') releaseSticks(game); setFocus(null); } return; }
                state.had = true;
                const g = typeof game !== 'undefined' ? game : null;
                const menuMode = dfMenuMode(g);
                if (menuMode !== state.lastMode) {
                    if (menuMode && g) releaseSticks(g);
                    if (!menuMode) setFocus(null);
                    state.lastMode = menuMode; state.navDir = null;
                    return;   // a button that just opened a menu (Start, Back, A) mustn't also press inside it
                }
                // Escape/Start in a scene opens the pause menu; everything else in a scene is the dialogue (A = next line)
                if (menuMode) menus(g); else gameplay(g);
            }

            function start() {
                controls.hooks.push(frame);
                if (!('getGamepads' in navigator)) return;
                window.addEventListener('gamepadconnected', () => {
                    document.body.classList.add('gamepad-active');
                    if (typeof showMessage === 'function') showMessage('CONTROLLER CONNECTED');
                });
                window.addEventListener('gamepaddisconnected', () => {
                    if ([...navigator.getGamepads()].some(p => p && p.connected)) return;
                    document.body.classList.remove('gamepad-active');
                    if (typeof showMessage === 'function') showMessage('CONTROLLER DISCONNECTED');
                });
            }

            return { start, state, _frame: frame };
        })();
        GamepadInput.start();
