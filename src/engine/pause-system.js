        /**
         * PauseSystem — token-based pause registry.
         *
         * Why this exists:
         *   Multiple subsystems need to pause the world (dialogue, shops, menus,
         *   cinematic transitions). Each one used to do `game.paused = true` on
         *   open and `game.paused = false` on close. That works in isolation but
         *   creates pairwise bugs when subsystems overlap: open the pause menu
         *   over an active dialogue, close the pause menu, and the world resumes
         *   while the dialogue box is still up. Three different incarnations of
         *   that same bug were patched piecemeal before the registry was added.
         *
         * How it works:
         *   Each subsystem acquires a unique token (`'dialogue'`, `'augment_shop'`,
         *   etc.) when it opens, and releases the same token when it closes. The
         *   world is paused if and only if at least one token is held. Subsystems
         *   are independent — releasing one doesn't affect the others.
         *
         * Compatibility:
         *   `game.paused` is kept in sync with the token set on every change, so
         *   read-only consumers (game loop, AI, render checks) don't need to be
         *   updated. The boolean stays the source of truth for *reading*; the
         *   token registry is the source of truth for *writing*.
         *
         * Adding a new pause-holding subsystem:
         *   On open:   game.pauseSystem.acquire('your_token_name');
         *   On close:  game.pauseSystem.release('your_token_name');
         *   That's it — no other coordination required, no other systems affected.
         */
        class PauseSystem {
            constructor(game) {
                this.game = game;
                this.tokens = new Set();
            }

            /**
             * Register a subsystem's need to pause the world. Idempotent — calling
             * acquire('x') twice without a release between is harmless.
             */
            acquire(token) {
                if (typeof token !== 'string' || !token) {
                    console.warn('[PauseSystem] acquire requires a non-empty string token');
                    return;
                }
                this.tokens.add(token);
                this._sync();
            }

            /**
             * Release a subsystem's pause hold. World remains paused if any other
             * tokens are still held. Releasing a token that wasn't held is a no-op.
             */
            release(token) {
                this.tokens.delete(token);
                this._sync();
            }

            /**
             * Drop ALL pause tokens. Reserved for game state reset and stop —
             * regular subsystems should release their own tokens, not call clear.
             */
            clear() {
                this.tokens.clear();
                this._sync();
            }


            /** Diagnostic: returns array of currently-held tokens. */
            debug() {
                return Array.from(this.tokens);
            }

            /**
             * Mirror token state to game.paused so legacy read sites continue to
             * work. The boolean is the public read interface; the token Set is the
             * authoritative write interface.
             */
            _sync() {
                if (this.game) this.game.paused = this.tokens.size > 0;
            }
        }
        
