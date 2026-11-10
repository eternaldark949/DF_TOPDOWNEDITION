export class touchStick {
    constructor(system, name, packet) {
        Object.assign(this, { anchor: 'centre', base_radius: 0, travel: 40, scale: () => 1, edge: 0, ring: null, input: null, slots: null, mouse: false, free: () => !this.s.active, onStart() {}, onMove() {}, onEnd() {} }, packet);
        this.system = system; this.name = name;
        this.disposed = false;
        this.disposers = [];
        const listen = (target,type,handler,options) => this.disposers.push(system.listen(target,type,handler,options));
        const el = x => typeof x === 'string' ? system.document?.getElementById(x) : x;
        this.zone = el(this.zone); this.knob = el(this.knob); this.base = el(this.base);
        this.s = { id: null, active: false, x0: 0, y0: 0, lx: 0, ly: 0, dx: 0, dy: 0, far: 0, angle: 0, kx: 0, ky: 0, out: false, slot: null, rects: null };
        this.value = [0, 0];
        if (!this.zone) return;
        const touchAction=this.zone.style?.touchAction;
        if(this.zone.style){this.zone.style.touchAction='none';this.disposers.push(()=>{this.zone.style.touchAction=touchAction??'';});}
        const z = this.zone, own = (e, fn) => { for (let i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === this.s.id) return fn(e.changedTouches[i]), true; return false; };
        listen(z, 'touchstart', e => { if(e.cancelable)e.preventDefault(); if (this.free() && !system.muted) this.start(e.changedTouches[0], e); }, { passive: false });
        listen(z, 'touchmove', e => { if(e.cancelable)e.preventDefault(); if (this.s.active) own(e, t => this.move(t, e)); }, { passive: false });
        const end = e => { if(e.cancelable)e.preventDefault(); if (this.s.active) own(e, () => this.end(e)); };
        listen(z, 'touchend', end); listen(z, 'touchcancel', e => { if(e.cancelable)e.preventDefault(); if(this.s.active) own(e, () => this.cancel(e)); });
        if (this.mouse) {
            const m = e => ({ identifier: 'mouse', clientX: e.clientX, clientY: e.clientY });
            listen(z, 'mousedown', e => { if(e.cancelable)e.preventDefault(); if (this.free() && !system.muted) this.start(m(e), e); });
            listen(system.event_target, 'mousemove', e => { if (this.s.active && this.s.id === 'mouse') this.move(m(e), e); });
            listen(system.event_target, 'mouseup', e => { if (this.s.active && this.s.id === 'mouse') this.end(e); });
        }
    }
    get maxTravel() { return typeof this.travel === 'function' ? this.travel() : this.travel; }
    start(t, e) {
        if(this.disposed)return;
        const s = this.s;
        if (this.anchor === 'touch') {
            const W = this.system.event_target?.innerWidth ?? 1280, H = this.system.event_target?.innerHeight ?? 720, ey = Math.min(this.edge, H * 0.24);   // a short screen: less margin top and bottom
            s.x0 = Math.max(this.edge, Math.min(W - this.edge, t.clientX)); s.y0 = Math.max(ey, Math.min(H - ey, t.clientY));
            s.lx = t.clientX; s.ly = t.clientY;
            if (this.base) Object.assign(this.base.style, { display: 'block', left: (s.x0 - this.base_radius) + 'px', top: (s.y0 - this.base_radius) + 'px' });
        } else {
            const r = this.zone.getBoundingClientRect();
            s.x0 = s.lx = r.left + r.width / 2; s.y0 = s.ly = r.top + r.height / 2;
        }
        Object.assign(s, { id: t.identifier, active: true, dx: 0, dy: 0, far: 0, angle: 0, kx: 0, ky: 0, out: false, slot: null, landX: t.clientX, landY: t.clientY });
        this.setKnob(0, 0);
        this.system.active_device = 'touch';
        this.onStart(s, e);
        if (this.slots) s.rects = Object.entries(this.slots).map(([key, el]) => [key, el.getBoundingClientRect()]);   // after onStart: it may show them
    }
    move(t, e) {
        const s = this.s, k = this.scale() || 1, T = this.maxTravel;
        if(!s.active || !Number.isFinite(T) || T<=0)return;
        s.dx = (t.clientX - s.lx) / k; s.dy = (t.clientY - s.ly) / k; s.far = Math.hypot(s.dx, s.dy); s.angle = Math.atan2(s.dy, s.dx);
        const gain = s.far > 0 ? Math.min(s.far,T)/s.far : 0; s.kx = s.dx * gain; s.ky = s.dy * gain;
        this.value = [s.kx / T, s.ky / T];
        this.system.active_device = 'touch';
        this.system.refreshVectors();
        if (this.ring) this.setOut(s.far >= this.ring[0] || (s.out && s.far > this.ring[1]));
        if (s.rects) {
            const hit = s.rects.find(([, r]) => t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom);
            const key = hit ? hit[0] : null;
            if (key !== s.slot) { s.slot && this.slots[s.slot].classList.remove('highlighted'); key && this.slots[key].classList.add('highlighted'); s.slot = key; }
        }
        if (this.onMove(s, e) !== false) this.setKnob(s.kx, s.ky);
    }
    setOut(out) {
        const s = this.s; if (out === s.out) return; s.out = out;
        if (!this.input) return;
        const T = this.system.touch, ev = this.system.ev('touch', this.input);
        out ? this.system.press(T, this.input, ev) : this.system.release(T, this.input, ev);
    }
    end(e) {
        const s = this.s;
        try { this.onEnd(s,e);this.setOut(false); }
        finally { this.release(); }
    }
    cancel(event) {
        try { if(this.s.active)this.onEnd(this.s,{type:'touchcancel',cancelled:true,event}); }
        finally { this.release(); }
    }
    /** Let go: back to rest, nothing more is sent (a lost finger, a menu opening). */
    release() {
        const s = this.s;
        if(this.input)this.system.cancelInput(this.system.touch,this.input);
        s.out = false;
        if (s.slot) this.slots[s.slot].classList.remove('highlighted');
        Object.assign(s, { id: null, active: false, dx: 0, dy: 0, far: 0, kx: 0, ky: 0, slot: null, rects: null });
        this.value = [0, 0];
        this.system.refreshVectors();
        this.setKnob(0, 0);
        if (this.base && this.anchor === 'touch') this.base.style.display = 'none';
    }
    dispose() { if(this.disposed)return;try{this.cancel();}finally{this.disposers.splice(0).forEach(drop => drop());this.disposed=true;} }
    setKnob(x, y) {
        if (!this.knob) return;
        this.knob.style.setProperty('--lx', x + 'px'); this.knob.style.setProperty('--ly', y + 'px');
    }
}
