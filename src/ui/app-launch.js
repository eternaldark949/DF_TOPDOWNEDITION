        /* =====================================================================
           APP LAUNCH: phone apps grow out of the icon you tapped
           ---------------------------------------------------------------------
           Every app shows itself by un-hiding its .phone-app-screen, from many
           places (ui/phone.js, ui/messages.js, …). Rather than touch each one, this
           watches the screens: when one appears within a moment of an icon tap, it
           opens out of that icon (a clip from the icon's circle to the full screen,
           with a slight scale-up), and when the home screen comes back from an app it
           settles in from a touch larger, the way a real phone's does.
           Players who ask for reduced motion get the plain switch.
           ===================================================================== */
        const AppLaunch = {
            _tap: null,            // { rect, at }: the icon last tapped
            _fromApp: false,       // an app was showing since the home screen last did
            MS: 340,
            _still() { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; },
            /** True while an app is opening out of its icon (Messages times its splash to it) */
            get launching() { return !!this._tap && performance.now() - this._tap.at < 700; },

            init() {
                const apps = document.getElementById('phone-apps'), home = document.getElementById('phone-home');
                const overlay = document.getElementById('phone-overlay');
                if (!apps || !home || typeof MutationObserver === 'undefined') return;
                const remember = (e) => {
                    const icon = e.target.closest && e.target.closest('.phone-app-container');
                    if (!icon) return;
                    const circle = icon.querySelector('.phone-app-icon-circle') || icon;
                    this._tap = { rect: circle.getBoundingClientRect(), at: performance.now() };
                };
                apps.addEventListener('pointerdown', remember, true);
                apps.addEventListener('click', remember, true);       // keyboards and controllers click without a pointer
                const shown = (el) => el.style.display && el.style.display !== 'none';
                const watch = new MutationObserver((records) => {
                    const seen = new Set();                              // a screen hidden and shown again in one go counts once
                    for (const r of records) {
                        if (seen.has(r.target)) continue;
                        const el = r.target, wasHidden = !/display:\s*(?!none)\w/.test(r.oldValue || '');
                        if (el === overlay) { if (shown(el) && wasHidden) this._fromApp = false; continue; }   // the phone itself opening
                        if (!shown(el) || !wasHidden) continue;         // only a hidden screen becoming visible
                        seen.add(el);
                        if (el === home) { if (this._fromApp) this._settleHome(); this._fromApp = false; }
                        else { this._fromApp = true; this._grow(el); }
                    }
                });
                document.querySelectorAll('.phone-app-screen').forEach(el => watch.observe(el, { attributes: true, attributeFilter: ['style'], attributeOldValue: true }));
                watch.observe(home, { attributes: true, attributeFilter: ['style'], attributeOldValue: true });
                if (overlay) watch.observe(overlay, { attributes: true, attributeFilter: ['style'], attributeOldValue: true });
            },

            _grow(el) {
                const tap = this._tap;
                if (!tap || performance.now() - tap.at > 700 || this._still() || !el.animate) return;
                const box = el.getBoundingClientRect();
                if (!box.width || !el.offsetWidth) return;
                const k = box.width / el.offsetWidth;                   // the phone is scaled to fit the window
                const t = (tap.rect.top - box.top) / k, l = (tap.rect.left - box.left) / k;
                const b = (box.bottom - tap.rect.bottom) / k, r = (box.right - tap.rect.right) / k;
                const ox = l + tap.rect.width / k / 2, oy = t + tap.rect.height / k / 2;
                const R = tap.rect.width / k / 2;
                el.getAnimations().forEach(a => { if (a.id === 'app-launch') a.cancel(); });
                const a = el.animate([
                    { clipPath: `inset(${t}px ${r}px ${b}px ${l}px round ${R}px)`, transform: 'scale(0.9)', opacity: 0.35 },
                    { clipPath: 'inset(0px 0px 0px 0px round 14px)', transform: 'none', opacity: 1 }
                ], { duration: this.MS, easing: 'cubic-bezier(0.2, 0.85, 0.25, 1)' });
                a.id = 'app-launch';
                el.style.transformOrigin = `${ox}px ${oy}px`;
                a.onfinish = a.oncancel = () => { el.style.transformOrigin = ''; };
            },

            _settleHome() {
                const home = document.getElementById('phone-home');
                if (this._still() || !home.animate) return;
                home.animate([{ transform: 'scale(1.06)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(0.2, 0.85, 0.25, 1)' });
            },
        };
        if (typeof document !== 'undefined' && document.getElementById) {
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => AppLaunch.init());
            else AppLaunch.init();
        }
