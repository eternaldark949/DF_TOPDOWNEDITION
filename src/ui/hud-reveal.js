        /* =====================================================================
           HUD REVEAL — the HUD appears piece by piece as the story introduces it
           ---------------------------------------------------------------------
           A new story game starts with only the pause button; each part is
           revealed when it's first needed (game.hud.reveal), often with the
           coach pointing at it (ui/coach.js). Unrevealed parts carry
           .hud-veiled, which beats the many inline style.display writes.
           Older saves and the gauntlet show everything.
           ===================================================================== */
        const HUD_PARTS = {
            phone:     ['btn-phone'],
            health:    ['ui-health', 'ui-shield-bar', 'ui-flit-bar-container'],
            move:      ['input-zone-left'],
            fire:      ['btn-fire'],
            holster:   ['btn-holster', 'btn-emote'],
            heal:      ['btn-heal'],
            flit:      ['btn-flit', 'joystick-ring'],
            nv:        ['btn-nv'],
            pp:        ['ui-currency'],
            stats:     ['ui-time', 'ui-scrap', 'ui-resonance'],
            location:  ['ui-location'],
            action:    ['action-dock'],
            autodrive: ['btn-autodrive'],
            handbrake: ['btn-handbrake'],
        };
        const HUD_KEYS = Object.keys(HUD_PARTS);

        class HudReveal {
            constructor(game) {
                this.game = game;
                this.revealed = new Set(HUD_KEYS);   // everything, until a story game starts fresh
                this.apply();
            }

            has(key) { return this.revealed.has(key); }

            /** A new story: only the pause button. */
            startFresh() { this.revealed = new Set(); this.apply(); }

            /** Everything (chapter end, gauntlet, older saves). */
            revealAll() { for (const k of HUD_KEYS) this.revealed.add(k); this.apply(); }

            /** The part's first element on screen (what the coach points at). */
            el(key) {
                for (const id of HUD_PARTS[key] || []) {
                    const e = document.getElementById(id);
                    if (e && e.getClientRects().length) return e;
                }
                return document.getElementById((HUD_PARTS[key] || [])[0]);
            }

            /** Put the veil on every part that isn't revealed yet. */
            apply() {
                for (const k of HUD_KEYS) for (const id of HUD_PARTS[k]) {
                    const e = document.getElementById(id);
                    if (e) e.classList.toggle('hud-veiled', !this.revealed.has(k));
                }
            }

            /**
             * Reveal a part: it materialises (a blur-to-sharp bloom). With a title or text
             * the coach points at it too — a spotlight the first time, a ring after.
             * Returns a waitable for scenes ({done(), value()}).
             */
            reveal(key, opts = {}) {
                const was = this.revealed.has(key);
                this.revealed.add(key);
                this.apply();
                if (!was) for (const id of HUD_PARTS[key] || []) {
                    const e = document.getElementById(id);
                    if (!e) continue;
                    e.classList.remove('hud-arrive'); void e.offsetWidth; e.classList.add('hud-arrive');
                    setTimeout(() => e.classList.remove('hud-arrive'), 1400);
                }
                if ((opts.title || opts.text) && this.game.coach) return this.game.coach.first(key, this.el(key), opts);
                return { done: () => true, value: () => null };
            }

            serialize() { return [...this.revealed]; }
            deserialize(list) {
                this.revealed = Array.isArray(list) ? new Set(list.filter(k => HUD_PARTS[k])) : new Set(HUD_KEYS);
                if (this.revealed.has('autodrive')) this.revealed.add('handbrake');   // saves from before the handbrake
                this.apply();
            }
        }
