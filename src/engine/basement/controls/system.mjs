// ===== LV0 BASEMENT =====
import { TAP, DOUBLETAP, HELD, PRESS, REPEAT, RELEASE } from './values.mjs';
import { radialStick, cleanupAll } from './values.mjs';
import { keyboardInstance, mouseInstance, touchInstance, gamepadInstance } from './devices.mjs';

export class controlSystem {
    #listeners = new Set();
    #frameHandle = null;
    #activated = new Set(); #released = new Set();
    #vectorActive = new Map(); #vectorTime = new Map();
    #disposed = false;
    /** { keymap, actions: [ACTION ROW...], context: () => the game (handed to when / run), timing } */
    constructor({ keymap = {}, actions = [], context = () => null, timing = {}, vectors = {},
        now = controlSystem.now, auto_update = false, query_actions = true,
        event_target = typeof window === 'undefined' ? null : window,
        document: document_target = typeof document === 'undefined' ? null : document,
        mouse_target = event_target,
        read_gamepads = () => typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [] } = {}) {
        if (typeof now !== 'function' || typeof read_gamepads !== 'function') throw new TypeError('Input clock and gamepad provider must be functions');
        this.now=now;this.auto_update=!!auto_update;this.query_actions=!!query_actions;this.event_target=event_target;this.document=document_target;
        this.read_gamepads=read_gamepads;this.active_device=null;this.vectors=structuredClone(vectors);
        for(const config of Object.values(this.vectors)){
            if(!config||typeof config!=='object'||config.gamepad!==undefined&&!['left','right'].includes(config.gamepad))throw new TypeError('Invalid direction binding');
            radialStick([0,0],config.dead_zone??.15);
        }
        const defaults = {
            tap_threshold: 0.195,   // s: a press shorter than this is a tap
            tap_wait_time: 0.25,    // s: after a tap, how long a second press makes it a double tap
            hold_wait_time: 1.0,    // s: held this long, it is a hold
            queue_wait_time: 0.8,   // s: how long a fired action waits in the queue to be read
        };
        for(const [name,value] of Object.entries(timing))if(!Object.hasOwn(defaults,name)||!Number.isFinite(value)||value<0)throw new TypeError('Invalid input timing');
        Object.assign(this,defaults,timing);
        this.context = context;
        this.actions = Object.create(null);
        this.queue = [];            // [action, type, time]
        this.pending = [];          // taps waiting to see if a second press comes: [input, action, ev]
        this.hooks = [];            // run each frame after the pad is read: fn(system, now)
        this.on_fire = [];          // told of every fired action: fn(action, type, ev)
        this.before_fire = [];      // told just before an action runs (a recorder reseeding the dice)
        this.muted = false;         // true: devices are not heard (a playback), except the inputs in unmuted
        this.unmuted = ['Escape'];
        for (const [name, when, run] of actions) this.actions[name] = [when, run];
        this.setKeymap(keymap);
        this.keyboard = new keyboardInstance(this);
        this.mouse = new mouseInstance(this, mouse_target);
        this.touch = new touchInstance(this);
        this.gamepad = new gamepadInstance(this);
        this.listen(event_target,'blur',()=>this.cancel());
        this.listen(document_target,'visibilitychange',()=>{if(document_target.hidden)this.cancel();});
        this.frame = this.frame.bind(this);
        if (this.auto_update && typeof requestAnimationFrame !== 'undefined') this.#frameHandle=requestAnimationFrame(this.frame);
    }
    get disposed() { return this.#disposed; }
    /** Browser subscriptions are owned and released by this input system. */
    listen(target,type,handler,options) {
        if(this.#disposed)throw new Error('controlSystem is disposed');
        if(!target?.addEventListener)return ()=>{};
        target.addEventListener(type,handler,options);
        const drop=()=>{target.removeEventListener(type,handler,options);this.#listeners.delete(drop);};
        this.#listeners.add(drop);return drop;
    }

    // ── The keymap ──────────────────────────────────────────────────────
    setKeymap(keymap) {
        if(!keymap||typeof keymap!=='object'||Array.isArray(keymap))throw new TypeError('keymap must be an object');
        const next=structuredClone(keymap),bindings=Object.create(null),inputs=Object.create(null);
        for (const action of Object.keys(next)) {
          if(!Array.isArray(next[action]))throw new TypeError('Action bindings must be arrays');
          for (const b of next[action]) {
            const [input, type = PRESS, hold] = Array.isArray(b) ? b : [b];
            if(typeof input!=='string'||!input||![TAP,DOUBLETAP,HELD,PRESS,REPEAT,RELEASE].includes(type)||hold!==undefined&&(!Number.isFinite(hold)||hold<0))throw new TypeError('Invalid input binding');
            (bindings[input] ||= []).push([action, type, hold]);
            (inputs[action] ||= []).push(input);
          }
        }
        if(this.keyboard)this.clear();
        this.keymap=next;this.bindings=bindings;this.inputs=inputs;
    }
    bind(action, ...bindings) { this.setKeymap({ ...this.keymap, [action]: bindings }); }
    bound(action, input) { return !!this.inputs[action]?.includes(input); }
    instanceOf(input) { return input.startsWith('gamepad') ? this.gamepad : input.startsWith('mouse') ? this.mouse : input.startsWith('touch') ? this.touch : this.keyboard; }

    // ── Asking ──────────────────────────────────────────────────────────
    active(action) { return this.vectors[action] ? Math.hypot(...this.direction(action))>0 : !!this.inputs[action]?.some(i => this.instanceOf(i).isActive(i)); }
    justActivated(action) { return this.#activated.has(action); }
    justReleased(action) { return this.#released.has(action); }
    /** How long (s) the action's input has been held (0: not held). */
    held(action) { if(this.vectors[action])return this.active(action)?Math.max(0,this.now()-(this.#vectorTime.get(action)??this.now())):0;const t = Math.min(...(this.inputs[action] || []).filter(i => this.instanceOf(i).isActive(i)).map(i => this.instanceOf(i).input_time[i])); return isFinite(t) ? Math.max(0,this.now() - t) : 0; }
    axis(neg, pos) { return (this.active(pos) ? 1 : 0) - (this.active(neg) ? 1 : 0); }
    /** [x, y] from `${name}_left/_right/_up/_down` (screen y: up is -1). */
    direction(name) {
        const config=this.vectors[name],prefix=config?.digital_prefix??name;
        const digital=[this.axis(prefix+'_left',prefix+'_right'),this.axis(prefix+'_up',prefix+'_down')];
        if(!config)return digital; // Preserve classic digital-only bindings until their callers convert.
        const candidates=[radialStick(digital,0)];
        if(config.touch)candidates.push(radialStick(this.touch.sticks[config.touch]?.value??[0,0],config.dead_zone??.15));
        if(config.gamepad)candidates.push(this.gamepad.stick(config.gamepad,config.dead_zone??.15));
        const chosen=candidates.reduce((best,value)=>value.m>best.m?value:best);
        return [chosen.x,chosen.y];
    }
    value(action) {
        if(this.vectors[action])return Math.hypot(...this.direction(action));
        let value=0;
        for(const input of this.inputs[action]??[]){
            const device=this.instanceOf(input);if(device.spent.has(input))continue;
            const analog=input==='gamepadLTrigger'?this.gamepad.left_trigger_value:input==='gamepadRTrigger'?this.gamepad.right_trigger_value:null;
            value=Math.max(value,analog??(device.isActive(input)?1:0));
        }
        return value;
    }
    getState(action) { return Object.freeze({active:this.active(action),just_activated:this.justActivated(action),just_released:this.justReleased(action),value:this.value(action),held:this.held(action),...(this.vectors[action]?{direction:Object.freeze(this.direction(action))}:{})}); }
    getActiveInputs(device) {
        const instances=device?[this[device]]:[this.keyboard,this.mouse,this.touch,this.gamepad];
        if(instances.some(instance=>!(instance instanceof Object)||typeof instance.getActiveInputs!=='function'))throw new TypeError('Unknown input device');
        return instances.flatMap(instance=>instance.getActiveInputs());
    }
    getActiveActions() { return [...new Set([...Object.keys(this.inputs),...Object.keys(this.vectors)])].filter(action=>this.active(action)); }
    setMouseTarget(target) { if(this.#disposed)throw new Error('controlSystem is disposed');this.mouse.dispose();this.mouse=new mouseInstance(this,target);this.queue.length=0;return this; }
    setInput(device,input,pressed) {
        const instance=this[device];if(!instance||this.instanceOf(input)!==instance)throw new TypeError('Input does not belong to that device');
        const event=this.ev(device,input);pressed?this.press(instance,input,event):this.release(instance,input,event);
    }
    pointer() { return Object.freeze({position:Object.freeze([this.mouse.x,this.mouse.y]),delta:Object.freeze([...this.mouse.delta]),wheel:Object.freeze([...this.mouse.wheel]),known:this.mouse.known}); }
    changeInput(input,change) {
        const actions=[...new Set((this.bindings[input]??[]).map(binding=>binding[0]))],before=actions.map(action=>this.active(action));
        change();actions.forEach((action,index)=>{const active=this.active(action);if(active&&!before[index])this.#activated.add(action);if(!active&&before[index])this.#released.add(action);});this.refreshVectors();
    }
    refreshVectors() {
        if(!this.keyboard||!this.gamepad||!this.touch)return;
        for(const name of Object.keys(this.vectors)){
            const active=this.active(name),before=this.#vectorActive.get(name)??false;
            if(active&&!before){this.#activated.add(name);this.#vectorTime.set(name,this.now());}
            if(!active&&before)this.#released.add(name);this.#vectorActive.set(name,active);
        }
    }
    /** Was `action` fired (of `type`, or any) within queue_wait_time? Reading it takes it out of the queue. */
    readQueue(action, type = null) {
        this.queue=this.queue.filter(row=>this.now()-row[2]<=this.queue_wait_time);
        const i = this.queue.findIndex(q => q[0] === action && (type === null || q[1] === type));
        return i >= 0 ? !!this.queue.splice(i, 1) : false;
    }
    /** Let go of everything held: nothing fires or reads as held until it is pressed again. */
    clear() {
        cleanupAll([...Object.values(this.touch.sticks).map(stick=>()=>stick.cancel()),()=>{
        for (const i of this.touch.input_active) this.touch.elements[i]?.classList.remove('held');
        for (const inst of [this.keyboard, this.mouse, this.touch, this.gamepad]) { for (const i of inst.input_active) inst.spent.add(i); inst.armed = Object.create(null); }
        this.pending.length = 0;
        this.queue.length = 0;this.gamepad.suppressAnalog();this.gamepad.suppressButtons();this.refreshVectors();this.generateAll();
        }],'Input clearing failed');
    }
    /** Focus loss/cancellation is not a tap, release action, or completed hold. */
    cancelInput(instance,input) {
        const active=instance.isActive(input);
        this.changeInput(input,()=>{instance.input_active.delete(input);instance.spent.delete(input);delete instance.armed[input];if(active)instance.input_just_released.add(input);});
        this.pending=this.pending.filter(row=>row[0]!==input);
    }
    cancel() { cleanupAll([()=>this.touch.cancel(),...[this.keyboard,this.mouse,this.gamepad].map(instance=>()=>instance.releaseAll()),()=>{this.gamepad.suppressAnalog();this.gamepad.suppressButtons();this.refreshVectors();this.mouse.delta=[0,0];this.mouse.wheel=[0,0];this.pending.length=0;this.queue.length=0;}],'Input cancellation failed'); }
    dispose() {
        if(this.#disposed)return;
        try{cleanupAll([()=>this.cancel(),()=>this.touch.dispose(),()=>{if(this.#frameHandle!==null&&typeof cancelAnimationFrame!=='undefined')cancelAnimationFrame(this.#frameHandle);},...[...this.#listeners].map(drop=>()=>drop())],'Input disposal failed');}
        finally{this.hooks.length=this.on_fire.length=this.before_fire.length=0;this.generateAll();this.#disposed=true;}
    }

    // ── Firing ──────────────────────────────────────────────────────────
    static now() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000; }
    ev(device, input, e = null) {
        return { device, input, type: null, time: this.now(), event: e, repeat: !!e?.repeat,
            typing: device === 'keyboard' && !!e && keyboardInstance.editable(e.target), shift: !!e?.shiftKey, ctrl: !!(e?.ctrlKey || e?.metaKey),
            preventDefault: () => e?.cancelable && e.preventDefault(), stop: () => { e?.stopPropagation?.(); e?.stopImmediatePropagation?.(); } };
    }
    can(action, ev) { const a = this.actions[action]; return a ? (!a[0] || !!a[0](this.context(), ev)) : this.query_actions && Object.hasOwn(this.inputs,action); }
    fire(action, type, ev) {
        if (!this.can(action, ev)) return false;
        ev.type = type;
        for (const fn of this.before_fire) fn(action, type, ev);
        this.queue.push([action, type, ev.time]);
        this.actions[action]?.[1]?.(this.context(), ev);
        for (const fn of this.on_fire) fn(action, type, ev);   // a recorder listening (legacy/basement/recorder-kit.js)
        return true;
    }
    press(inst, input, ev) {
        if(this.#disposed || inst.spent.has(input))return;
        if (this.muted && !this.unmuted.includes(input)) return;   // a playback has the controls
        const list = this.bindings[input] || [];
        if (inst.input_active.has(input)) { for (const [a, t] of list) if (t === REPEAT) this.fire(a, t, { ...ev, repeat: true }); return; }
        if (!ev.typing) this.changeInput(input,()=>{inst.input_active.add(input); inst.input_just_activated.add(input); inst.input_time[input] = ev.time; inst.armed[input] = new Set(list.filter(b => this.can(b[0], ev)).map(b => b[0]));});
        this.active_device=inst.device;
        // A second press soon after a tap: a double tap (and that tap is dropped)
        const p = this.pending.findIndex(q => q[0] === input && ev.time - q[2].time <= this.tap_wait_time);
        if (p >= 0) { this.pending = this.pending.filter(q => q[0] !== input); inst.armed[input] && (inst.armed[input].double = true); for (const [a, t] of list) if (t === DOUBLETAP) this.fire(a, t, ev); }
        for (const [a, t] of list) if (t === PRESS || t === REPEAT) this.fire(a, t, ev);
    }
    release(inst, input, ev) {
        if (this.muted && !this.unmuted.includes(input)) return;
        const armed = inst.armed[input], since = inst.input_time[input];
        let was;const spent=inst.spent.has(input);
        this.changeInput(input,()=>{was=inst.input_active.delete(input);inst.spent.delete(input);delete inst.armed[input];});
        if (!was) return;
        if(spent)return;
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
    #poll(now = this.now(), { advance = this.auto_update } = {}) {
        if(this.#disposed)throw new Error('controlSystem is disposed');
        if (this.muted) { if(advance)this.generateAll(); return; }   // playback owns injected state
        this.gamepad.updateGamepads();
        this.refreshVectors();
        for (const inst of [this.keyboard, this.mouse, this.touch, this.gamepad]) for (const input in inst.armed) {
            const armed = inst.armed[input], since = inst.input_time[input];
            for (const [a, t, hold] of this.bindings[input] || []) {
                if (t !== HELD || !armed.has(a) || armed['held_' + a] || now - since < (hold ?? this.hold_wait_time)) continue;
                armed['held_' + a] = armed.held = true;
                this.fire(a, t, {...this.ev(inst.device, input),time:now});
            }
        }
        this.pending = this.pending.filter(([, a, ev]) => now - ev.time <= this.tap_wait_time || (this.fire(a, TAP, ev), false));
        this.queue = this.queue.filter(q => now - q[2] <= this.queue_wait_time);
        for (const fn of this.hooks) fn(this, now);
        if(advance)this.generateAll();
    }
    updateState(now = this.now()) { this.#poll(now,{advance:false}); }
    generateAll() { for (const inst of [this.keyboard, this.mouse, this.touch, this.gamepad]) inst.generateGhostImage();this.#activated.clear();this.#released.clear(); }
    generateGhostImage() { this.generateAll(); }
    frame() { if(this.#disposed)return;this.#poll();if(!this.#disposed)this.#frameHandle=requestAnimationFrame(this.frame); }
}
