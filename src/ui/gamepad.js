        /* =========================================================================
           GAMEPAD — controller support through the browser Gamepad API.

           It writes into the same input state the touch sticks use, so movement,
           aiming, driving and firing need no new paths in the engine:
             left stick  → game.joystick       (analog walk / steer, like the move stick)
             right stick → game.fireJoystick   (aim; RT fires, like pushing past the ring)
           Buttons call the same methods as the HUD buttons and keyboard keys.

           Its own requestAnimationFrame loop runs whether or not the game is paused,
           so the pad also works the title screen and every menu: the D-pad or left
           stick moves a highlight between the visible things you can click, A clicks
           it, B goes back (Escape), Start pauses. Standard mapping (Xbox names):

             A  interact / confirm        B  flit / back          X  holster · draw
             Y  doors & exits             LB sneak                RB booster (hold: ally)
             LT handbrake (driving)       RT fire                 L3 auto-drive (driving)
             Back  map                    Start pause             D-pad ↑ phone · ↓ night vision
           ========================================================================= */
        const GamepadInput = (() => {
            const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
            const MOVE_DEAD = 0.18, AIM_DEAD = 0.3, TRIGGER = 0.4, NAV_DEAD = 0.55;
            const REPEAT_FIRST = 380, REPEAT_NEXT = 110;          // ms: held D-pad / stick in menus
            const HOLD_ALLY = 300;                               // ms: RB held → booster on the nearest ally (as the HUD button)

            const state = { index: null, prev: [], raf: 0, focus: null, navDir: null, navAt: 0, autoAt: 0, aDown: null, rbAt: 0, rbHeld: false, ownsMove: false, ownsAim: false, lastMode: null };

            const pressed = (pad, i) => { const b = pad.buttons[i]; return !!b && (b.pressed || b.value > TRIGGER); };
            const down = (pad, i) => pressed(pad, i) && !state.prev[i];
            const up = (pad, i) => !pressed(pad, i) && state.prev[i];
            /** A stick with a radial dead zone, rescaled so the edge of the dead zone is 0. */
            const stick = (x, y, dead) => {
                const m = Math.hypot(x, y);
                if (m < dead) return { x: 0, y: 0, m: 0 };
                const k = Math.min(1, (m - dead) / (1 - dead)) / m;
                return { x: x * k, y: y * k, m: Math.min(1, (m - dead) / (1 - dead)) };
            };
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
            const visibleBtn = (el) => !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none';
            const rumble = (ms, strength) => {
                const pad = state.index !== null && navigator.getGamepads ? navigator.getGamepads()[state.index] : null;
                try { pad?.vibrationActuator?.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength }); } catch (e) { /* no rumble */ }
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

            function gameplay(g, pad) {
                const J = g.joystick, F = g.fireJoystick;
                // Left stick: walk / steer — unless a finger already has the move stick
                const L = stick(pad.axes[0] || 0, pad.axes[1] || 0, MOVE_DEAD);
                if (J.id === null || J.id === 'pad') {
                    if (L.m > 0) { Object.assign(J, { active: true, id: 'pad', dx: L.x, dy: L.y }); state.ownsMove = true; }
                    else if (state.ownsMove) { Object.assign(J, { active: false, id: null, dx: 0, dy: 0 }); state.ownsMove = false; }
                }

                // Right stick aims; RT fires (along the stick, or straight ahead with no stick)
                const R = stick(pad.axes[2] || 0, pad.axes[3] || 0, AIM_DEAD);
                const rt = pressed(pad, B.RT), canAim = !g.weaponHolstered || g._quickDraw || g.isDriving;
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
                    if (g._quickDraw && up(pad, B.RT)) g.requestQuickDraw(Math.atan2(F.dy || Math.sin(g.player.angle), F.dx || Math.cos(g.player.angle)));
                }

                // Driving: LT is the handbrake, L3 auto-drive
                g.handbrakeHeld = !!(g.isDriving && pressed(pad, B.LT));
                document.getElementById('btn-handbrake')?.classList.toggle('held', g.handbrakeHeld);
                if (g.isDriving && down(pad, B.L3)) g.toggleAutoDrive();

                if (down(pad, B.A)) g.interact();
                if (down(pad, B.B) && !g.isDriving) { if (g.triggerFlit(undefined, 'pad')) rumble(90, 0.5); }
                if (down(pad, B.X) && !g.isDriving) {
                    if (g._quickDraw) { g.cancelQuickDraw(); g.setWeaponHolstered(false); }
                    else g.setWeaponHolstered(!g.weaponHolstered);
                }
                if (down(pad, B.Y) && visibleBtn(g.transitionBtn)) g.triggerTransition();
                if (down(pad, B.LB) && !g.isDriving) g.toggleSneak();
                // RB: tap = booster, hold = booster on the nearest damaged ally
                if (down(pad, B.RB)) { state.rbAt = performance.now(); state.rbHeld = false; }
                if (pressed(pad, B.RB) && !state.rbHeld && performance.now() - state.rbAt > HOLD_ALLY) { state.rbHeld = true; g.useBoosterOnAlly(); }
                if (up(pad, B.RB) && !state.rbHeld) g.useBooster();

                if (down(pad, B.BACK)) Screens.open('map');
                if (down(pad, B.UP)) phoneSystem.open();
                if (down(pad, B.DOWN)) document.getElementById('btn-nv')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                if (down(pad, B.START)) key('Escape');
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
            function menus(g, pad) {
                // Direction: D-pad, or the left stick past halfway; held → repeats
                const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
                let dir = null;
                if (pressed(pad, B.UP) || ay < -NAV_DEAD) dir = 'up';
                else if (pressed(pad, B.DOWN) || ay > NAV_DEAD) dir = 'down';
                else if (pressed(pad, B.LEFT) || ax < -NAV_DEAD) dir = 'left';
                else if (pressed(pad, B.RIGHT) || ax > NAV_DEAD) dir = 'right';
                const now = performance.now();
                if (!dir && now >= state.autoAt) { state.autoAt = now + 200; if (!isLive(state.focus)) autoFocus(g); }
                if (dir && (dir !== state.navDir || now >= state.navAt)) {
                    state.navAt = now + (dir !== state.navDir ? REPEAT_FIRST : REPEAT_NEXT);
                    const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
                    move(D[0], D[1]);
                }
                state.navDir = dir;
                // Right stick scrolls whatever list is under the highlight
                const ry = pad.axes[3] || 0;
                if (Math.abs(ry) > AIM_DEAD) {
                    let s = state.focus || document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
                    while (s && s !== document.body && !(s.scrollHeight > s.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
                    if (s && s !== document.body) s.scrollTop += ry * 14;
                }
                // A presses the highlighted item the way a mouse does (down on press, up + click on release),
                // so buttons wired to pointerdown, mousedown, pointerup or click all answer, and hold buttons hold
                if (down(pad, B.A)) {
                    const el = state.focus;
                    if (isLive(el) && el.matches('input:not([type="checkbox"]):not([type="radio"]), select, textarea')) el.focus();
                    else if (isLive(el)) { state.aDown = el; mouse(el, 'down'); }
                    else key('Enter');                          // nothing highlighted: advance a line
                }
                if (up(pad, B.A) && state.aDown) { const el = state.aDown; state.aDown = null; if (el.isConnected) mouse(el, 'up'); }
                if (down(pad, B.B) || down(pad, B.START)) key('Escape');
                if (down(pad, B.BACK) && (Screens.mapOpen() || Screens.menuOpen())) Screens.close();
            }

            // ── The loop ────────────────────────────────────────────────────────
            function frame() {
                state.raf = requestAnimationFrame(frame);
                const pads = navigator.getGamepads ? navigator.getGamepads() : [];
                let pad = state.index !== null ? pads[state.index] : null;
                if (!pad || !pad.connected) { pad = [...pads].find(p => p && p.connected) || null; state.index = pad ? pad.index : null; }
                if (!pad) return;
                const g = typeof game !== 'undefined' ? game : null;
                const menuMode = !g || !g.running || g.paused || hudInputBlocked() || !!(g.scenes && g.scenes.running);
                if (menuMode !== state.lastMode) {
                    if (menuMode && g) releaseSticks(g);
                    if (!menuMode) setFocus(null);
                    state.lastMode = menuMode; state.navDir = null;
                }
                // Escape/Start in a scene opens the pause menu; everything else in a scene is the dialogue (A = next line)
                if (menuMode) menus(g, pad); else gameplay(g, pad);
                state.prev = pad.buttons.map(b => b.pressed || b.value > TRIGGER);
            }

            function start() {
                if (!('getGamepads' in navigator)) return;
                window.addEventListener('gamepadconnected', (e) => {
                    if (state.index === null) state.index = e.gamepad.index;
                    document.body.classList.add('gamepad-active');
                    if (typeof showMessage === 'function') showMessage('CONTROLLER CONNECTED');
                    if (!state.raf) state.raf = requestAnimationFrame(frame);
                });
                window.addEventListener('gamepaddisconnected', (e) => {
                    if (e.gamepad.index !== state.index) return;
                    state.index = null; state.prev = [];
                    if (typeof game !== 'undefined') releaseSticks(game);
                    setFocus(null);
                    if (![...navigator.getGamepads()].some(p => p && p.connected)) {
                        document.body.classList.remove('gamepad-active');
                        cancelAnimationFrame(state.raf); state.raf = 0;
                        if (typeof showMessage === 'function') showMessage('CONTROLLER DISCONNECTED');
                    }
                });
                // A pad already plugged in before the page loaded only reports itself on its first button press,
                // which fires gamepadconnected above; nothing else to do here.
            }

            return { start, state, _frame: frame };
        })();
        GamepadInput.start();
