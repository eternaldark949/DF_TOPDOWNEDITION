// Quick draw is a transient combat mode. Shots still use fireWeapon and its normal bonuses.
engineMixin({
    setWeaponHolstered(on) {
        this.weaponHolstered = !!on;
        if (!on) { this._drawnAt = _gameTimeSec; this._drawShotUsed = false; }
        this.holsterAnimTarget = on ? 0 : 1;
        const quick = !!this._quickDraw;
        this.holsterBtn.classList.toggle('holstered', !!on);
        this.holsterBtn.classList.toggle('quick-draw', quick);
        if (!quick) this.holsterBtn.classList.remove('recovering');
        this.holsterBtn.innerHTML = quick ? 'QUICK<br>DRAW' : on ? 'DRAW' : 'HOLSTER';
        this.holsterBtn.title = quick ? 'Quick draw: aim past the ring and release. Tap to leave.' : 'Tap to holster/draw. Hold for quick draw.';
        this.holsterBtn.setAttribute('aria-pressed', String(quick));
        this.fireBtn.style.display = !on || quick ? 'flex' : 'none';
        this.emoteBtn.style.display = on && !quick ? 'flex' : 'none';
    },
    armQuickDraw() {
        if (!this.running || this.paused || hudInputBlocked() || this.isDriving || this.player.dead
            || !this.player.visible || !this.currentWeapon || !['normal', 'sniper'].includes(this.weaponMode)
            || this.furniture?.busy() || this.cutscene?.active) return false;
        clearGameplayInputs(this);
        this._quickDraw = { weapon: this.currentWeapon, phase: 'ready', ticks: 0 };
        this.setWeaponHolstered(true);
        showMessage('QUICK DRAW — AIM PAST THE RING AND RELEASE');
        return true;
    },
    interruptQuickDrawShot() {
        const q = this._quickDraw;
        if (!q) return;
        if (q.weapon !== this.currentWeapon || this.isDriving || this.player.dead) { this.cancelQuickDraw(); return; }
        q.phase = 'ready'; q.ticks = 0; q.aimPoint = null; q.angle = null;
        this._quickDrawFiring = false;
        this.setWeaponHolstered(true);
    },
    cancelQuickDraw() {
        if (!this._quickDraw) return;
        this._quickDraw = null; this._quickDrawFiring = false;
        this.setWeaponHolstered(true);
    },
    requestQuickDraw(angle, aimPoint) {
        const q = this._quickDraw;
        if (!q || q.phase !== 'ready' || !Number.isFinite(angle) || !this.running || this.paused
            || hudInputBlocked() || this.isDriving || this.player.dead || !this.player.visible
            || this.currentWeapon !== q.weapon || this.furniture?.busy() || this.cutscene?.active) return false;
        // A release during recovery is discarded, never queued to fire later.
        if (this.shootCooldown > 0) { showMessage('QUICK DRAW — RECOVERING'); return false; }
        q.phase = 'draw'; q.ticks = 7; q.angle = angle;
        q.aimPoint = aimPoint ? { x: aimPoint.x, y: aimPoint.y } : null;
        this.setWeaponHolstered(false);
        this.player.angle = angle;
        return true;
    },
    updateQuickDraw() {
        const q = this._quickDraw;
        if (!q) return;
        if (this.currentWeapon !== q.weapon || !['normal', 'sniper'].includes(this.weaponMode)
            || this.isDriving || this.player.dead || !this.player.visible || this.cutscene?.active || this.furniture?.busy()) {
            this.cancelQuickDraw(); return;
        }
        this.holsterBtn.classList.toggle('recovering', q.phase !== 'ready' || this.shootCooldown > 0);
        const label = q.phase === 'draw' ? 'DRAWING' : this.shootCooldown > 0
            ? `RECOVER<br>${(Math.ceil(this.shootCooldown / 6) / 10).toFixed(1)}s` : 'QUICK<br>DRAW';
        if (this.holsterBtn.innerHTML !== label) this.holsterBtn.innerHTML = label;
        if (q.phase === 'ready') return;
        this.player.angle = q.angle;
        if (--q.ticks > 0) return;
        if (q.phase === 'draw') {
            this.player._aimPoint = q.aimPoint;
            this._quickDrawFiring = true;
            try { this.fireWeapon(); } finally { this._quickDrawFiring = false; }
            this.shootCooldown = Math.max(36, this.shootCooldown + 18);
            q.phase = 'shot'; q.ticks = 10;
        } else {
            q.phase = 'ready'; this.setWeaponHolstered(true);
        }
    },
    initQuickDrawControl() {
        const btn = this.holsterBtn;
        let pointer = null, held = false, timer = null;
        this._cancelQuickDrawHold = () => { clearTimeout(timer); timer = null; pointer = null; held = false; };
        btn.title = 'Tap to holster/draw. Hold for quick draw.';
        btn.addEventListener('pointerdown', e => {
            e.preventDefault(); e.stopPropagation();
            if (pointer !== null || (e.button !== undefined && e.button !== 0) || !this.running || this.paused || hudInputBlocked() || this.isDriving) return;
            pointer = e.pointerId; held = false;
            try { btn.setPointerCapture(pointer); } catch (_) {}
            timer = setTimeout(() => { held = true; this.armQuickDraw(); }, 450);
        });
        btn.addEventListener('pointerup', e => {
            if (e.pointerId !== pointer) return;
            e.preventDefault(); const tap = !held; this._cancelQuickDrawHold();
            if (!tap || this.paused || !this.running || hudInputBlocked()) return;
            if (this._quickDraw) { this.cancelQuickDraw(); this.setWeaponHolstered(false); }
            else this.setWeaponHolstered(!this.weaponHolstered);
        });
        for (const event of ['pointercancel', 'lostpointercapture']) btn.addEventListener(event, this._cancelQuickDrawHold);
        btn.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
        window.addEventListener('blur', () => clearGameplayInputs(this));
    }
});
