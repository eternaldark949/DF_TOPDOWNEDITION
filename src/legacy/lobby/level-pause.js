        // ===== LV1 LOBBY =====
        // The pause registry: the world holds still while any part of the game holds a pause token.
        //
        // Several things pause the world (dialogue, shops, menus, cinematic cuts), and they overlap: open
        // the pause menu over a dialogue, close the pause menu, and the world must stay paused while the
        // dialogue is up. So nobody sets "paused" directly. Each one acquires its own token when it opens
        // and releases it when it closes; the world is paused while at least one is held. Releasing one
        // never touches the others.
        //
        //   pause.acquire('dialogue');   pause.release('dialogue');
        //   pause.clear();               // drop every token: only for a reset or leaving the world
        //   pause.paused                 // true while any token is held
        //
        // A subclass (or a game) reacts to a change by overriding onChange(paused, was_paused).
        class levelPause {
            constructor () {
                this.tokens = new Set();
            }

            get paused () { return this.tokens.size > 0; }

            /** Hold the world still for `token`. Holding the same token twice is harmless. */
            acquire (token) {
                if (typeof token !== 'string' || !token) {
                    console.warn('[PauseSystem] acquire requires a non-empty string token');
                    return;
                }
                this.tokens.add(token);
                this._sync();
            }

            /** Let go of `token`. The world stays paused while others are held; an unheld token is a no-op. */
            release (token) {
                this.tokens.delete(token);
                this._sync();
            }

            /** Drop every token. Only for a reset or leaving the world; a part of the game releases its own. */
            clear () {
                this.tokens.clear();
                this._sync();
            }

            /** The tokens held now (diagnostics). */
            debug () { return Array.from(this.tokens); }

            _sync () { this.onChange(this.paused); }

            /** Override: called after every acquire / release / clear with the paused state. */
            onChange (paused) {}
        }
