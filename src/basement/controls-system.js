        // ===== LV0 BASEMENT =====
        // The controls system: every key, mouse button and gamepad button goes through one place. It knows
        // nothing about any game: the game hands it a keymap (action -> the inputs bound to it) and an
        // action table (action -> when it may fire, what it does), both in the Directory.
        // (The terms are from the g7 engine: base game script 2.0's controlsSystem and V1's controlSystem.)
        //
        //   keyboardInstance ┐
        //   mouseInstance    ├── press / release ── keymap ── action table ── run(game, ev)
        //   gamepadInstance  ┘        (polled each frame)            └── queue (readQueue: buffered inputs)
        //
        // Each instance keeps input_active (held now), input_just_activated and input_just_released (this
        // frame), and ghost_image (what was held last frame: generateGhostImage, at the end of a frame).
        //
        // INPUT NAMES:   keys by e.key, letters in lower case ('w', 'space', 'Escape', 'ArrowUp', 'Enter');
        //                'mouseLeft' | 'mouseMiddle' | 'mouseRight';
        //                'gamepadA' 'gamepadB' 'gamepadX' 'gamepadY' 'gamepadLBumper' 'gamepadRBumper'
        //                'gamepadLTrigger' 'gamepadRTrigger' 'gamepadBack' 'gamepadStart' 'gamepadLStickButton'
        //                'gamepadRStickButton' 'gamepadDUp' 'gamepadDDown' 'gamepadDLeft' 'gamepadDRight'
        // KEYMAP:        { action: [binding, binding, ...] }
        //   BINDING:     'input'  (PRESS)  or  [input, type, hold]
        //     PRESS      on the press (a held key's auto-repeat doesn't fire it again)
        //     REPEAT     on the press and on every auto-repeat of a held key
        //     RELEASE    on the release
        //     TAP        on the release of a short press: under tap_threshold, or, when the input also
        //                has a HELD binding, before that hold fired. With a DOUBLETAP binding on the same
        //                input it waits tap_wait_time for a second press first
        //     DOUBLETAP  on a second press within tap_wait_time of a tap (that tap is then not fired)
        //     HELD       once, when the input has been held for `hold` s (or hold_wait_time)
        // ACTION ROW:    [action, when, run]
        //   when(game, ev)  may it fire now? (null: always). A TAP, HELD or RELEASE also needs it to
        //                   have been true at the press: a button held from a menu into play stays quiet
        //   run(game, ev)   what it does
        //   EV:          { device, input, type, time, repeat, typing, shift, ctrl, preventDefault(), stop() }
        //                (typing: a keystroke into a text field; only actions that allow it should fire)
        // Actions with no row are only asked about: active('move_up'), direction('move'), held(...).
        const TAP = 0, DOUBLETAP = 1, HELD = 2, PRESS = 3, REPEAT = 4, RELEASE = 5;

        class inputInstance {
            constructor(system, device) {
                this.system = system; this.device = device;
                this.input_active = new Set();
                this.input_just_activated = new Set();
                this.input_just_released = new Set();
                this.ghost_image = new Set();
                this.input_time = {};      // input -> when it went down (s)
                this.armed = {};           // input -> the actions whose `when` was true at the press
                this.spent = new Set();    // held through clear(): ignored until released
            }
            isActive(input) { return this.input_active.has(input) && !this.spent.has(input); }
            getActiveInputs() { return [...this.input_active].filter(i => !this.spent.has(i)); }
            /** The end of a frame: this frame's held inputs become the ghost image; the just-sets empty. */
            generateGhostImage() {
                this.ghost_image = new Set(this.input_active);
                this.input_just_activated.clear(); this.input_just_released.clear();
            }
            /** Scripted input (tests, demos, replays): exactly these inputs are held now. Nothing fires. */
            setInputs(inputs) {
                for (const i of [...this.input_active]) if (!inputs.includes(i)) { this.input_active.delete(i); this.spent.delete(i); delete this.armed[i]; }
                for (const i of inputs) if (!this.input_active.has(i)) { this.input_active.add(i); this.input_time[i] = controlsSystem.now(); }
            }
            releaseAll() { for (const i of [...this.input_active]) this.system.release(this, i, this.system.ev(this.device, i)); }
        }

        class keyboardInstance extends inputInstance {
            /** Keys go down on the window (made early, so it hears them before the window's later listeners
             *  and ev.stop() keeps them from those) and come up on its capture phase, ahead of anything that
             *  swallows keyups. */
            constructor(system) {
                super(system, 'keyboard');
                if (typeof window === 'undefined') return;
                window.addEventListener('keydown', e => this.event(e, true));
                window.addEventListener('keyup', e => this.event(e, false), true);
                window.addEventListener('blur', () => this.releaseAll());
            }
            static keyName(k) { return k === ' ' ? 'space' : k && k.length === 1 ? k.toLowerCase() : k; }
            static editable(t) { return t instanceof Element && !!t.closest('input, textarea, select, [contenteditable="true"]'); }
            event(e, down) {
                const input = keyboardInstance.keyName(e.key);
                if (!input) return;
                const ev = this.system.ev('keyboard', input, e);
                down ? this.system.press(this, input, ev) : this.system.release(this, input, ev);
            }
        }

        class mouseInstance extends inputInstance {
            constructor(system, target) {
                super(system, 'mouse');
                this.x = 0; this.y = 0;
                if (typeof window === 'undefined') return;
                target = target || window;
                const B = ['mouseLeft', 'mouseMiddle', 'mouseRight'];
                target.addEventListener('mousemove', e => { this.x = e.clientX; this.y = e.clientY; }, { passive: true });
                target.addEventListener('mousedown', e => B[e.button] && this.system.press(this, B[e.button], this.system.ev('mouse', B[e.button], e)));
                window.addEventListener('mouseup', e => B[e.button] && this.system.release(this, B[e.button], this.system.ev('mouse', B[e.button], e)));
            }
        }

        class gamepadInstance extends inputInstance {
            /** Standard mapping: button index -> name. */
            static BUTTONS = ['gamepadA', 'gamepadB', 'gamepadX', 'gamepadY', 'gamepadLBumper', 'gamepadRBumper', 'gamepadLTrigger', 'gamepadRTrigger',
                'gamepadBack', 'gamepadStart', 'gamepadLStickButton', 'gamepadRStickButton', 'gamepadDUp', 'gamepadDDown', 'gamepadDLeft', 'gamepadDRight'];
            constructor(system) {
                super(system, 'gamepad');
                this.index = null; this.pad = null;
                this.trigger_threshold = 0.4;               // a trigger past this counts as pressed
                this.left_stick_value = [0, 0]; this.right_stick_value = [0, 0];
                this.left_trigger_value = 0; this.right_trigger_value = 0;
            }
            get connected() { return !!this.pad; }
            /** Read the pad (the first connected one): its sticks and triggers, and press / release its buttons. */
            updateGamepads() {
                const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
                let pad = this.index !== null ? pads[this.index] : null;
                if (!pad || !pad.connected) { pad = [...pads].find(p => p && p.connected) || null; this.index = pad ? pad.index : null; }
                if (!pad) { if (this.pad) { this.pad = null; this.releaseAll(); this.left_stick_value = [0, 0]; this.right_stick_value = [0, 0]; this.left_trigger_value = this.right_trigger_value = 0; } return; }
                this.pad = pad;
                const A = pad.axes, Bt = pad.buttons;
                this.left_stick_value = [A[0] || 0, A[1] || 0]; this.right_stick_value = [A[2] || 0, A[3] || 0];
                this.left_trigger_value = Bt[6] ? Bt[6].value : 0; this.right_trigger_value = Bt[7] ? Bt[7].value : 0;
                gamepadInstance.BUTTONS.forEach((name, i) => {
                    const b = Bt[i], on = !!b && (b.pressed || b.value > this.trigger_threshold);
                    if (on !== this.input_active.has(name)) on ? this.system.press(this, name, this.system.ev('gamepad', name)) : this.system.release(this, name, this.system.ev('gamepad', name));
                });
            }
            /** A stick ('left' | 'right') with a radial dead zone, rescaled so the edge of the dead zone is 0: { x, y, m }. */
            stick(which, dead = 0.15) {
                const [x, y] = which === 'left' ? this.left_stick_value : this.right_stick_value, m = Math.hypot(x, y);
                if (m < dead) return { x: 0, y: 0, m: 0 };
                const k = Math.min(1, (m - dead) / (1 - dead)) / m;
                return { x: x * k, y: y * k, m: Math.min(1, (m - dead) / (1 - dead)) };
            }
            rumble(ms, strength) {
                try { this.pad?.vibrationActuator?.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength }); } catch (e) { /* no rumble */ }
            }
        }

        class controlsSystem {
            /** { keymap, actions: [ACTION ROW...], context: () => the game (handed to when / run), timing } */
            constructor({ keymap = {}, actions = [], context = () => null, timing = {} } = {}) {
                Object.assign(this, {
                    tap_threshold: 0.195,   // s: a press shorter than this is a tap
                    tap_wait_time: 0.25,    // s: after a tap, how long a second press makes it a double tap
                    hold_wait_time: 1.0,    // s: held this long, it is a hold
                    queue_wait_time: 0.8,   // s: how long a fired action waits in the queue to be read
                }, timing);
                this.context = context;
                this.actions = {};
                this.queue = [];            // [action, type, time]
                this.pending = [];          // taps waiting to see if a second press comes: [input, action, ev]
                this.hooks = [];            // run each frame after the pad is read: fn(system, now)
                for (const [name, when, run] of actions) this.actions[name] = [when, run];
                this.setKeymap(keymap);
                this.keyboard = new keyboardInstance(this);
                this.mouse = new mouseInstance(this);
                this.gamepad = new gamepadInstance(this);
                this.frame = this.frame.bind(this);
                if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(this.frame);
            }

            // ── The keymap ──────────────────────────────────────────────────────
            setKeymap(keymap) {
                this.keymap = keymap; this.bindings = {}; this.inputs = {};
                for (const action in keymap) for (const b of keymap[action]) {
                    const [input, type = PRESS, hold] = Array.isArray(b) ? b : [b];
                    (this.bindings[input] ||= []).push([action, type, hold]);
                    (this.inputs[action] ||= []).push(input);
                }
            }
            bind(action, ...bindings) { this.setKeymap({ ...this.keymap, [action]: bindings }); }
            bound(action, input) { return !!this.inputs[action]?.includes(input); }
            instanceOf(input) { return input.startsWith('gamepad') ? this.gamepad : input.startsWith('mouse') ? this.mouse : this.keyboard; }

            // ── Asking ──────────────────────────────────────────────────────────
            active(action) { return !!this.inputs[action]?.some(i => this.instanceOf(i).isActive(i)); }
            justActivated(action) { return !!this.inputs[action]?.some(i => this.instanceOf(i).input_just_activated.has(i)); }
            justReleased(action) { return !!this.inputs[action]?.some(i => this.instanceOf(i).input_just_released.has(i)); }
            /** How long (s) the action's input has been held (0: not held). */
            held(action) { const t = Math.min(...(this.inputs[action] || []).filter(i => this.instanceOf(i).isActive(i)).map(i => this.instanceOf(i).input_time[i])); return isFinite(t) ? controlsSystem.now() - t : 0; }
            axis(neg, pos) { return (this.active(pos) ? 1 : 0) - (this.active(neg) ? 1 : 0); }
            /** [x, y] from `${name}_left/_right/_up/_down` (screen y: up is -1). */
            direction(name) { return [this.axis(name + '_left', name + '_right'), this.axis(name + '_up', name + '_down')]; }
            /** Was `action` fired (of `type`, or any) within queue_wait_time? Reading it takes it out of the queue. */
            readQueue(action, type = null) {
                const i = this.queue.findIndex(q => q[0] === action && (type === null || q[1] === type));
                return i >= 0 ? !!this.queue.splice(i, 1) : false;
            }
            /** Let go of everything held: nothing fires or reads as held until it is pressed again. */
            clear() {
                for (const inst of [this.keyboard, this.mouse, this.gamepad]) { for (const i of inst.input_active) inst.spent.add(i); inst.armed = {}; }
                this.pending.length = 0;
            }

            // ── Firing ──────────────────────────────────────────────────────────
            static now() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000; }
            ev(device, input, e = null) {
                return { device, input, type: null, time: controlsSystem.now(), event: e, repeat: !!e?.repeat,
                    typing: device === 'keyboard' && !!e && keyboardInstance.editable(e.target), shift: !!e?.shiftKey, ctrl: !!(e?.ctrlKey || e?.metaKey),
                    preventDefault: () => e?.cancelable && e.preventDefault(), stop: () => { e?.stopPropagation?.(); e?.stopImmediatePropagation?.(); } };
            }
            can(action, ev) { const a = this.actions[action]; return !!a && (!a[0] || !!a[0](this.context(), ev)); }
            fire(action, type, ev) {
                if (!this.can(action, ev)) return false;
                ev.type = type;
                this.queue.push([action, type, ev.time]);
                this.actions[action][1]?.(this.context(), ev);
                return true;
            }
            press(inst, input, ev) {
                const list = this.bindings[input] || [];
                if (inst.input_active.has(input)) { for (const [a, t] of list) if (t === REPEAT) this.fire(a, t, { ...ev, repeat: true }); return; }
                if (!ev.typing) { inst.input_active.add(input); inst.input_just_activated.add(input); inst.input_time[input] = ev.time; inst.armed[input] = new Set(list.filter(b => this.can(b[0], ev)).map(b => b[0])); }
                // A second press soon after a tap: a double tap (and that tap is dropped)
                const p = this.pending.findIndex(q => q[0] === input && ev.time - q[2].time <= this.tap_wait_time);
                if (p >= 0) { this.pending = this.pending.filter(q => q[0] !== input); inst.armed[input] && (inst.armed[input].double = true); for (const [a, t] of list) if (t === DOUBLETAP) this.fire(a, t, ev); }
                for (const [a, t] of list) if (t === PRESS || t === REPEAT) this.fire(a, t, ev);
            }
            release(inst, input, ev) {
                const armed = inst.armed[input], since = inst.input_time[input];
                const was = inst.input_active.delete(input);
                inst.spent.delete(input); delete inst.armed[input];
                if (!was) return;
                inst.input_just_released.add(input);
                if (!armed) return;
                const list = this.bindings[input] || [], dur = ev.time - since;
                for (const [a, t, hold] of list) if (t === HELD && armed.has(a) && !armed['held_' + a] && dur >= (hold ?? this.hold_wait_time)) { armed['held_' + a] = armed.held = true; this.fire(a, t, ev); }   // a hold that ended between two frames
                const hold = list.filter(b => b[1] === HELD).map(b => b[2] ?? this.hold_wait_time), short = dur <= (hold.length ? Math.min(...hold) : this.tap_threshold);
                const double = list.some(b => b[1] === DOUBLETAP);
                for (const [a, t] of list) {
                    if (!armed.has(a)) continue;
                    if (t === RELEASE) this.fire(a, t, ev);
                    if (t === TAP && short && !armed.held && !armed.double) double ? this.pending.push([input, a, ev]) : this.fire(a, t, ev);
                }
            }

            // ── The frame ───────────────────────────────────────────────────────
            update(now = controlsSystem.now()) {
                this.gamepad.updateGamepads();
                for (const inst of [this.keyboard, this.mouse, this.gamepad]) for (const input in inst.armed) {
                    const armed = inst.armed[input], since = inst.input_time[input];
                    for (const [a, t, hold] of this.bindings[input] || []) {
                        if (t !== HELD || !armed.has(a) || armed['held_' + a] || now - since < (hold ?? this.hold_wait_time)) continue;
                        armed['held_' + a] = armed.held = true;
                        this.fire(a, t, this.ev(inst.device, input));
                    }
                }
                this.pending = this.pending.filter(([, a, ev]) => now - ev.time <= this.tap_wait_time || (this.fire(a, TAP, ev), false));
                this.queue = this.queue.filter(q => now - q[2] <= this.queue_wait_time);
                for (const fn of this.hooks) fn(this, now);
                this.keyboard.generateGhostImage(); this.mouse.generateGhostImage(); this.gamepad.generateGhostImage();
            }
            frame() { requestAnimationFrame(this.frame); this.update(); }
        }
