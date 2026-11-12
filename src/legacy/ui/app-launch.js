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
                    this._tap = { rect: circle.getBoundingClientRect(), at: performance.now(), icon };
                };
                apps.addEventListener('pointerdown', remember, true);
                // a press you can feel: the icon or the M button squishes in, then springs back with a warm gold flash
                const press = (el) => {
                    if (!el || this._still() || !el.animate) return;
                    el.classList.remove('tap-flash'); void el.offsetWidth; el.classList.add('tap-flash');
                    clearTimeout(el._tapT); el._tapT = setTimeout(() => el.classList.remove('tap-flash'), 600);
                    el.animate([{ transform: 'scale(0.86)' }, { transform: 'scale(1.08)', offset: 0.45 }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)' });
                };
                apps.addEventListener('click', (e) => {
                    const icon = e.target.closest && e.target.closest('.phone-app-container');
                    if (icon) press(icon.querySelector('.phone-app-icon-circle'));
                }, true);
                const btn = document.getElementById('btn-phone');
                if (btn) btn.addEventListener('click', () => press(btn), true);
                apps.addEventListener('click', remember, true);       // keyboards and controllers click without a pointer
                const shown = (el) => el.style.display && el.style.display !== 'none';
                const watch = new MutationObserver((records) => {
                    const seen = new Set();                              // a screen hidden and shown again in one go counts once
                    for (const r of records) {
                        if (seen.has(r.target)) continue;
                        const el = r.target, wasHidden = !/display:\s*(?!none)\w/.test(r.oldValue || '');
                        if (el === overlay) { if (shown(el) && wasHidden) { this._fromApp = false; this._rise(); } continue; }   // the phone itself opening
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
                el.getAnimations().forEach(a => { if (a.id === 'app-launch') a.cancel(); });
                const box = el.getBoundingClientRect();                 // measured before the grow scales it
                if (!box.width || !el.offsetWidth) return;
                const k = box.width / el.offsetWidth;                   // the phone is scaled to fit the window
                const t = (tap.rect.top - box.top) / k, l = (tap.rect.left - box.left) / k;
                const b = (box.bottom - tap.rect.bottom) / k, r = (box.right - tap.rect.right) / k;
                const ox = l + tap.rect.width / k / 2, oy = t + tap.rect.height / k / 2;
                const R = tap.rect.width / k / 2;
                const a = el.animate([
                    { clipPath: `inset(${t}px ${r}px ${b}px ${l}px round ${R}px)`, transform: 'scale(0.9)', opacity: 0.35 },
                    { clipPath: 'inset(0px 0px 0px 0px round 14px)', transform: 'none', opacity: 1 }
                ], { duration: this.MS, easing: 'cubic-bezier(0.2, 0.85, 0.25, 1)' });
                a.id = 'app-launch';
                el.style.transformOrigin = `${ox}px ${oy}px`;
                this._splash(tap.icon, el, box, a.effect.getKeyframes(), { duration: this.MS, easing: 'cubic-bezier(0.2, 0.85, 0.25, 1)' });
                a.onfinish = a.oncancel = () => { el.style.transformOrigin = ''; };
            },

            /** The phone rises out of the M button (#btn-phone) and grows to its full size */
            _rise() {
                const phone = document.getElementById('phone-container'), btn = document.getElementById('btn-phone');
                if (this._still() || !phone || !phone.animate) return;
                const k = (typeof phoneSystem !== 'undefined' && phoneSystem.scale) || 1;
                const box = phone.getBoundingClientRect(), from = btn && btn.getBoundingClientRect();
                const end = { transform: `scale(${k})`, opacity: 1 };
                let start = { transform: `translateY(40px) scale(${k * 0.92})`, opacity: 0 };      // no button on screen: rise from below
                if (from && from.width && box.width) {
                    const dx = from.left + from.width / 2 - (box.left + box.width / 2), dy = from.top + from.height / 2 - (box.top + box.height / 2);
                    start = { transform: `translate(${dx}px, ${dy}px) scale(${(from.width / box.width * k).toFixed(4)})`, opacity: 0.2 };
                }
                phone.getAnimations().forEach(a => { if (a.id === 'phone-rise') a.cancel(); });
                const a = phone.animate([start, { transform: `scale(${k * 1.015})`, opacity: 1, offset: 0.8 }, end], { duration: 420, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)' });
                a.id = 'phone-rise';
                const overlay = document.getElementById('phone-overlay');
                if (overlay) overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
            },

            /* Each app's launch screen, after its icon: the glyph on a tile, the name, a line of light
               sweeping under it, on a ground lit in the app's own colour. (Messages has its own: the M.) */
            ACCENT: {
                'app-maps': '#ffc45c', 'app-sticky': '#ff5c9a', 'app-carme': '#ffb347', 'app-skyme': '#6aa9ff',
                'app-zibme': '#a46bff', 'app-neume': '#ff4fe0', 'app-amber': '#ffb54a', 'app-help': '#c9b6ff', 'app-log': '#e0b25a'
            },
            SPLASH_MS: 520,
            _splash(icon, screen, box, keyframes, opts) {
                const host = document.getElementById('phone-screen');
                if (!host || !icon || screen.id === 'screen-contacts') return;
                host.querySelectorAll('.app-splash').forEach(e => e.remove());
                const acc = this.ACCENT[icon.id] || '#e8c27a';
                const glyph = icon.querySelector('.phone-app-icon-circle'), name = icon.querySelector('.phone-app-name');
                const sp = uiKit.make(['div', 'app-splash']);
                sp.style.setProperty('--acc', acc);
                const tile = uiKit.make(['div', 'as-tile']);
                if (glyph) glyph.childNodes.forEach(n => { if (!(n.classList && n.classList.contains('app-badge'))) tile.appendChild(n.cloneNode(true)); });
                const label = uiKit.make(['div', 'as-name', name ? name.textContent : '']);
                const line = uiKit.make(['div', 'as-line']);
                sp.append(tile, label, line);
                // it sits over the app's screen, so it grows out of the icon with it
                const hb = host.getBoundingClientRect(), k = hb.width / host.offsetWidth || 1;
                Object.assign(sp.style, { left: (box.left - hb.left) / k + 'px', top: (box.top - hb.top) / k + 'px', width: screen.offsetWidth + 'px', height: screen.offsetHeight + 'px', transformOrigin: screen.style.transformOrigin });
                host.appendChild(sp);
                sp.animate(keyframes, opts);
                setTimeout(() => {
                    sp.classList.add('out');
                    setTimeout(() => sp.remove(), 360);
                }, this.SPLASH_MS);
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
