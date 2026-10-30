        // ColorPicker — the in-game custom colour picker, shared by the Clothing Dyer (engine/dyer.js) and Torque's
        // Customize tab (engine/shops-menus.js), in place of the browser's own colour dialog.
        //
        // ColorPicker.html(hex) is the panel's markup: a saturation/brightness square on the hue, a hue strip,
        // a swatch of the colour, its hex (typed, or pasted), and the last RECENT colours picked anywhere.
        // ColorPicker.bind(root, hex, { onInput, onPick }) wires it: onInput(hex) while a thumb is dragged
        // (for a live preview, without re-rendering the screen), onPick(hex) once it's let go, a hex is
        // entered, or a recent colour is tapped (and that colour goes to the front of the recents).
        // Pointer events, so a finger drags it as a mouse does. Recents live in this browser only.

        const ColorPicker = {
            RECENT: 8,
            KEY: 'dfab_recent_colors',

            /** '#rrggbb' → { h 0..360, s 0..1, v 0..1 } */
            toHsv(hex) {
                const n = parseInt(String(hex).slice(1), 16) || 0, r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
                const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
                let h = 0;
                if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
                return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
            },

            /** { h, s, v } → '#rrggbb' */
            toHex({ h, s, v }) {
                const f = k => { const x = (k + h / 60) % 6; return v - v * s * Math.max(0, Math.min(x, 4 - x, 1)); };
                return '#' + [f(5), f(3), f(1)].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
            },

            /** A hex as typed ('#abc', 'abc', '#AABBCC') → '#aabbcc', or null */
            parse(text) {
                let t = String(text || '').trim().replace(/^#/, '').toLowerCase();
                if (/^[0-9a-f]{3}$/.test(t)) t = t.replace(/./g, c => c + c);
                return /^[0-9a-f]{6}$/.test(t) ? '#' + t : null;
            },

            /** The hsv to show for a hex: the one last dragged to it if it's that colour (a hue picked on white or
             *  black isn't in its hex, and would snap back to red on the next render), else its own */
            hsvOf(hex) {
                const L = this._last;
                return L && L.hex === hex ? { ...L.hsv } : this.toHsv(hex);
            },

            recent() {
                try { const L = JSON.parse(localStorage.getItem(this.KEY)); return Array.isArray(L) ? L.filter(c => this.parse(c)).slice(0, this.RECENT) : []; }
                catch (e) { return []; }
            },

            remember(hex) {
                const L = [hex, ...this.recent().filter(c => c !== hex)].slice(0, this.RECENT);
                try { localStorage.setItem(this.KEY, JSON.stringify(L)); } catch (e) { /* private mode */ }
            },

            html(hex) {
                hex = this.parse(hex) || '#ffffff';
                const { h, s, v } = this.hsvOf(hex), rec = this.recent();
                let out = `<div class="cp" style="--hue:${Math.round(h)};--c:${hex}">`;
                out += `<div class="cp-sv" role="slider" aria-label="Saturation and brightness" tabindex="0"><i class="cp-thumb" style="left:${(s * 100).toFixed(1)}%;top:${((1 - v) * 100).toFixed(1)}%"></i></div>`;
                out += `<div class="cp-hue" role="slider" aria-label="Hue" tabindex="0" aria-valuemin="0" aria-valuemax="360" aria-valuenow="${Math.round(h)}"><i class="cp-thumb" style="left:${(h / 3.6).toFixed(1)}%"></i></div>`;
                out += `<div class="cp-row"><span class="cp-chip"></span><input class="cp-hex" type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Hex colour" value="${hex}">`;
                out += `<span class="cp-recent">${rec.map(c => `<button class="cp-dot" data-hex="${c}" style="--c:${c}" title="${c}" aria-label="Recent ${c}"></button>`).join('')}</span></div>`;
                return out + `</div>`;
            },

            bind(root, hex, { onInput, onPick } = {}) {
                const el = root && root.querySelector('.cp'); if (!el) return;
                const hsv = this.hsvOf(this.parse(hex) || '#ffffff');
                const sv = el.querySelector('.cp-sv'), hue = el.querySelector('.cp-hue'), field = el.querySelector('.cp-hex');
                const svThumb = sv.querySelector('.cp-thumb'), hueThumb = hue.querySelector('.cp-thumb');
                const show = () => {
                    const c = this.toHex(hsv);
                    el.style.setProperty('--hue', Math.round(hsv.h)); el.style.setProperty('--c', c);
                    svThumb.style.left = `${hsv.s * 100}%`; svThumb.style.top = `${(1 - hsv.v) * 100}%`;
                    hueThumb.style.left = `${hsv.h / 3.6}%`; hue.setAttribute('aria-valuenow', Math.round(hsv.h));
                    if (document.activeElement !== field) field.value = c;
                    this._last = { hex: c, hsv: { ...hsv } };
                    return c;
                };
                const done = c => { this.remember(c); if (onPick) onPick(c); };
                const drag = (target, set) => {
                    target.addEventListener('pointerdown', ev => {
                        ev.preventDefault();
                        try { target.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic */ }
                        const move = e => { const r = target.getBoundingClientRect(); set(Math.max(0, Math.min(1, (e.clientX - r.left) / (r.width || 1))), Math.max(0, Math.min(1, (e.clientY - r.top) / (r.height || 1)))); const c = show(); if (onInput) onInput(c); };
                        const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); done(this.toHex(hsv)); };
                        target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
                        move(ev);
                    });
                };
                drag(sv, (x, y) => { hsv.s = x; hsv.v = 1 - y; });
                drag(hue, x => { hsv.h = Math.min(359.9, x * 360); });
                // Arrow keys nudge a slider; letting go of the key picks it
                const keys = (target, step) => {
                    target.addEventListener('keydown', e => { if (step(e.key)) { e.preventDefault(); const c = show(); if (onInput) onInput(c); } });
                    target.addEventListener('keyup', e => { if (/^Arrow/.test(e.key)) done(this.toHex(hsv)); });
                };
                keys(sv, k => { const d = 0.04; if (k === 'ArrowLeft') hsv.s = Math.max(0, hsv.s - d); else if (k === 'ArrowRight') hsv.s = Math.min(1, hsv.s + d); else if (k === 'ArrowUp') hsv.v = Math.min(1, hsv.v + d); else if (k === 'ArrowDown') hsv.v = Math.max(0, hsv.v - d); else return false; return true; });
                keys(hue, k => { if (k === 'ArrowLeft') hsv.h = (hsv.h + 355) % 360; else if (k === 'ArrowRight') hsv.h = (hsv.h + 5) % 360; else return false; return true; });
                field.addEventListener('input', () => { const c = this.parse(field.value); if (!c) return; Object.assign(hsv, this.toHsv(c)); show(); if (onInput) onInput(c); });
                field.addEventListener('change', () => { const c = this.parse(field.value); if (c) done(c); else field.value = this.toHex(hsv); });
                field.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') field.blur(); });   // typing never moves her
                el.querySelectorAll('.cp-dot').forEach(b => b.addEventListener('click', () => { Object.assign(hsv, this.toHsv(b.dataset.hex)); show(); done(b.dataset.hex); }));
            }
        };
