        /* =====================================================================
           COMMS & TALK STYLE — the earpiece, and which look the talk UI wears
           ---------------------------------------------------------------------
           TalkStyle: Settings → Developer → Talk Style. 'veil' (default): the
           dialogue is a dusk veil with the speaker's bust, and comms are a thread
           of chips down the left edge. 'ribbon': a gilded panel with a medallion,
           and comms are one cameo under the health bar. The looks are CSS
           (styles/panels-phone.css, body.talk-ribbon); kept per device.

           Comms.say(game, speaker, text, ms): one line over the earpiece. Each
           line is a chip with the speaker's painted portrait; the newest three
           stay (one as a cameo), older ones dim, each leaves after its time.
           ===================================================================== */
        const TalkStyle = {
            get() { return GameSettings.talkStyle === 'ribbon' ? 'ribbon' : 'veil'; },
            set(v) {
                GameSettings.talkStyle = v === 'ribbon' ? 'ribbon' : 'veil';
                try { localStorage.setItem('dfab_talk_style', GameSettings.talkStyle); } catch (e) { /* private mode */ }
                this.apply();
            },
            apply() { if (document.body) document.body.classList.toggle('talk-ribbon', this.get() === 'ribbon'); },
        };
        if (document.body) TalkStyle.apply(); else document.addEventListener('DOMContentLoaded', () => TalkStyle.apply());

        const Comms = {
            say(game, speaker, text, ms = 3000) {
                const bar = document.getElementById('comms-bar');
                if (!bar) return;
                const chip = document.createElement('div');
                chip.className = 'comm-chip';
                chip.style.setProperty('--who', (typeof SPEAKER_COLORS !== 'undefined' && SPEAKER_COLORS[this._name(speaker)]) || '#e8c27a');
                const face = document.createElement('div');
                face.className = 'comm-face';
                const url = this._face(game, speaker);
                if (url) { const img = new Image(); img.alt = ''; img.src = url; face.appendChild(img); }
                else face.textContent = String(speaker || '?').trim().charAt(0).toUpperCase();
                const body = document.createElement('div');
                body.className = 'comm-body';
                const name = document.createElement('div');
                name.className = 'comm-name';
                name.textContent = speaker;
                const sig = document.createElement('span');
                sig.className = 'comm-sig'; sig.innerHTML = '<i></i><i></i><i></i>';
                name.appendChild(sig);
                const line = document.createElement('div');
                line.className = 'comm-text';
                line.textContent = text;
                body.append(name, line);
                chip.append(face, body);
                bar.appendChild(chip);
                // Keep the newest few (one cameo in the ribbon look); the ones before dim as they age
                const keep = TalkStyle.get() === 'ribbon' ? 1 : 3;
                const live = [...bar.querySelectorAll('.comm-chip:not(.out)')];
                for (const c of live.slice(0, Math.max(0, live.length - keep))) this._drop(c);
                this._age(bar);
                const gone = () => this._drop(chip);
                if (game && game.addPausableTimeout) game.addPausableTimeout(gone, ms); else setTimeout(gone, ms);
            },
            _drop(chip) {
                if (chip.classList.contains('out')) return;
                chip.classList.add('out');
                setTimeout(() => chip.remove(), 500);
                const bar = chip.parentElement;
                if (bar) this._age(bar);
            },
            _age(bar) {
                const live = [...bar.querySelectorAll('.comm-chip:not(.out)')].reverse();
                live.forEach((c, i) => { c.classList.toggle('old', i === 1); c.classList.toggle('older', i >= 2); });
            },
            /** The cast's spelling of a name given in capitals ('LARISSA' → 'Larissa'). */
            _name(speaker) {
                const s = String(speaker || '');
                if (typeof APPEARANCES !== 'undefined' && !APPEARANCES[s]) {
                    const k = Object.keys(APPEARANCES).find(n => n.toLowerCase() === s.toLowerCase());
                    if (k) return k;
                }
                return s;
            },
            _face(game, speaker) {
                try {
                    const n = this._name(speaker);
                    if (!game || !game.resolvePortraitConfig || game.resolvePortraitConfig(n).isFallback) return null;
                    return game.getPortraitDataURL(n, 104, null);
                } catch (e) { return null; }
            },
        };
